import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";

const router = Router();

router.get("/summary", authenticate, requirePermission("reports:read"), async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const isAdmin = (req as any).user?.role === "ADMIN";

  const dateFilter = from || to
    ? { soldAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
    : {};

  try {
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: dateFilter,
        select: { total: true, profitAmt: true, soldAt: true, sellerId: true, seller: { select: { fullName: true } }, subtotal: true, discountPct: true, discountAmt: true }
      }),
      isAdmin
        ? prisma.expense.findMany({
            where: from || to
              ? { expenseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
              : {},
            select: { amount: true, category: true }
          })
        : Promise.resolve([])
    ]);

    const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
    const totalProfit = isAdmin ? sales.reduce((s, x) => s + (x.profitAmt ?? 0), 0) : null;
    const totalExpenses = isAdmin ? expenses.reduce((s, x) => s + x.amount, 0) : null;
    const totalDiscount = isAdmin ? sales.reduce((s, x) => {
      const pctDiscount = x.subtotal * (x.discountPct / 100);
      return s + pctDiscount + x.discountAmt;
    }, 0) : null;
    const netProfit = isAdmin && totalProfit !== null && totalExpenses !== null
      ? totalProfit - totalExpenses
      : null;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalSales: sales.length,
        ...(isAdmin ? { totalProfit, totalExpenses, netProfit, totalDiscount } : {})
      }
    });
  } catch {
    res.status(500).json({ success: false, error: "Hesabat alınmadı" });
  }
});

router.get("/commissions", authenticate, requirePermission("reports:commissions"), async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;

  try {
    const sellers = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SELLER"] }, isActive: true },
      select: { id: true, fullName: true, commission: true }
    });

    const dateFilter = from || to
      ? { soldAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {};

    const result = await Promise.all(
      sellers.map(async seller => {
        const sales = await prisma.sale.findMany({
          where: { sellerId: seller.id, ...dateFilter },
          select: { total: true, subtotal: true, discountPct: true, discountAmt: true, soldAt: true }
        });
        const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
        const commissionAmt = (totalRevenue * seller.commission) / 100;
        const totalDiscount = sales.reduce((s, x) => {
          const pctDiscount = x.subtotal * (x.discountPct / 100);
          return s + pctDiscount + x.discountAmt;
        }, 0);

        // Aylıq breakdown
        const monthly: Record<string, { revenue: number; commission: number; count: number }> = {};
        for (const sale of sales) {
          const key = sale.soldAt.toISOString().slice(0, 7); // YYYY-MM
          if (!monthly[key]) monthly[key] = { revenue: 0, commission: 0, count: 0 };
          monthly[key].revenue += sale.total;
          monthly[key].commission += (sale.total * seller.commission) / 100;
          monthly[key].count += 1;
        }
        const monthlyBreakdown = Object.entries(monthly)
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, data]) => ({ month, ...data }));

        return { ...seller, totalRevenue, commissionAmt, salesCount: sales.length, totalDiscount, monthlyBreakdown };
      })
    );

    res.json({ success: true, data: { items: result } });
  } catch {
    res.status(500).json({ success: false, error: "Komissiyalar alınmadı" });
  }
});

router.get("/profit", authenticate, requirePermission("reports:profit"), async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const dateFilter = from || to
    ? { soldAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
    : {};

  try {
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: dateFilter,
        select: { total: true, profitAmt: true, soldAt: true, subtotal: true, discountPct: true, discountAmt: true }
      }),
      prisma.expense.findMany({
        where: from || to
          ? { expenseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {},
        select: { amount: true, category: true, expenseDate: true }
      })
    ]);

    const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
    const totalCostProfit = sales.reduce((s, x) => s + (x.profitAmt ?? 0), 0);
    const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
    const netProfit = totalCostProfit - totalExpenses;
    const totalDiscount = sales.reduce((s, x) => {
      const pctDiscount = x.subtotal * (x.discountPct / 100);
      return s + pctDiscount + x.discountAmt;
    }, 0);

    const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalCostProfit,
        totalExpenses,
        netProfit,
        totalDiscount,
        expensesByCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
        salesCount: sales.length
      }
    });
  } catch {
    res.status(500).json({ success: false, error: "Mənfəət hesabatı alınmadı" });
  }
});

// ─── Dərzi bonusları ──────────────────────────────────────────────────────────
router.get("/tailor-bonuses", authenticate, requirePermission("reports:read"), async (_req: Request, res: Response): Promise<void> => {
  try {
    const tailors = await prisma.user.findMany({
      where: { role: "TAILOR", isActive: true },
      select: { id: true, fullName: true }
    });

    const result = await Promise.all(
      tailors.map(async tailor => {
        const orders = await prisma.tailorOrder.findMany({
          where: { tailorId: tailor.id },
          select: { meters: true, stitchType: true, bonusPerUnit: true, totalBonus: true, status: true, completedAt: true }
        });

        const completedOrders = orders.filter(o => o.status === "READY");
        const totalBonus = completedOrders.reduce((s, o) => s + (o.totalBonus ?? 0), 0);
        const totalMeters = completedOrders.reduce((s, o) => s + (o.meters ?? 0), 0);
        const straightCount = completedOrders.filter(o => (o.stitchType ?? "straight") === "straight").length;
        const buzmeCount = completedOrders.filter(o => o.stitchType === "buzme").length;

        // Aylıq breakdown
        const monthly: Record<string, { bonus: number; meters: number; count: number }> = {};
        for (const o of completedOrders) {
          const key = o.completedAt ? o.completedAt.toISOString().slice(0, 7) : "unknown";
          if (!monthly[key]) monthly[key] = { bonus: 0, meters: 0, count: 0 };
          monthly[key].bonus += o.totalBonus ?? 0;
          monthly[key].meters += o.meters ?? 0;
          monthly[key].count += 1;
        }
        const monthlyBreakdown = Object.entries(monthly)
          .filter(([k]) => k !== "unknown")
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, data]) => ({ month, ...data }));

        return { ...tailor, totalBonus, totalMeters, completedCount: completedOrders.length, straightCount, buzmeCount, monthlyBreakdown };
      })
    );

    res.json({ success: true, data: { items: result } });
  } catch {
    res.status(500).json({ success: false, error: "Dərzi bonusları alınmadı" });
  }
});

export default router;
