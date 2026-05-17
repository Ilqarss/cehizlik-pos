import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";

const router = Router();

router.get("/summary", authenticate, requirePermission("reports:read"), async (req: Request, res: Response): Promise<void> => {
  const { from, to } = req.query as Record<string, string>;
  const canViewFinancials = (req as any).user?.role === "ADMIN" || (req as any).user?.role === "SELLER";

  const dateFilter = from || to
    ? { soldAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
    : {};

  try {
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: dateFilter,
        select: { total: true, profitAmt: true, soldAt: true, sellerId: true, seller: { select: { fullName: true } }, subtotal: true, discountPct: true, discountAmt: true }
      }),
      canViewFinancials
        ? prisma.expense.findMany({
            where: from || to
              ? { expenseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
              : {},
            select: { amount: true, category: true }
          })
        : Promise.resolve([])
    ]);

    const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
    const totalProfit = canViewFinancials ? sales.reduce((s, x) => s + (x.profitAmt ?? 0), 0) : null;
    const totalExpenses = canViewFinancials ? expenses.reduce((s, x) => s + x.amount, 0) : null;
    const totalDiscount = canViewFinancials ? sales.reduce((s, x) => {
      const pctDiscount = x.subtotal * (x.discountPct / 100);
      return s + pctDiscount + x.discountAmt;
    }, 0) : null;
    const netProfit = canViewFinancials && totalProfit !== null && totalExpenses !== null
      ? totalProfit - totalExpenses
      : null;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalSales: sales.length,
        ...(canViewFinancials ? { totalProfit, totalExpenses, netProfit, totalDiscount } : {})
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

    const byDate = sales.reduce<Record<string, { revenue: number, profit: number }>>((acc, s) => {
      const dateKey = s.soldAt.toISOString().slice(0, 10); // YYYY-MM-DD
      if (!acc[dateKey]) acc[dateKey] = { revenue: 0, profit: 0 };
      acc[dateKey].revenue += s.total;
      acc[dateKey].profit += s.profitAmt ?? 0;
      return acc;
    }, {});
    
    const dailyTrend = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalCostProfit,
        totalExpenses,
        netProfit,
        totalDiscount,
        expensesByCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
        dailyTrend,
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

// ─── Usta qazancları ──────────────────────────────────────────────────────────
router.get("/usta-earnings", authenticate, requirePermission("reports:read"), async (req: Request, res: Response): Promise<void> => {
  try {
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.id;
    
    const ustas = await prisma.user.findMany({
      where: { 
        role: "USTA", 
        isActive: true,
        ...(userRole === "USTA" ? { id: userId } : {})
      },
      select: { id: true, fullName: true }
    });

    const result = await Promise.all(
      ustas.map(async usta => {
        const orders = await prisma.installationOrder.findMany({
          where: { ustaId: usta.id }
        });

        const totalFee = orders.reduce((s, o) => s + (o.totalFee ?? 0), 0);
        const totalQuantity = orders.reduce((s, o) => s + (o.quantity ?? 0), 0);
        const straightCount = orders.filter(o => o.installationType === "STRAIGHT_CORNICE").length;
        const curvedCount = orders.filter(o => o.installationType === "CURVED_CORNICE").length;
        const jalousieCount = orders.filter(o => o.installationType === "JALOUSIE").length;

        // Aylıq breakdown
        const monthly: Record<string, { fee: number; quantity: number; count: number }> = {};
        for (const o of orders) {
          const key = o.createdAt ? o.createdAt.toISOString().slice(0, 7) : "unknown";
          if (!monthly[key]) monthly[key] = { fee: 0, quantity: 0, count: 0 };
          monthly[key].fee += o.totalFee ?? 0;
          monthly[key].quantity += o.quantity ?? 0;
          monthly[key].count += 1;
        }
        const monthlyBreakdown = Object.entries(monthly)
          .filter(([k]) => k !== "unknown")
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([month, data]) => ({ month, ...data }));

        return { 
          ...usta, 
          totalFee, 
          totalQuantity, 
          completedCount: orders.length, 
          straightCount, 
          curvedCount, 
          jalousieCount, 
          monthlyBreakdown 
        };
      })
    );

    res.json({ success: true, data: { items: result } });
  } catch {
    res.status(500).json({ success: false, error: "Usta qazancları alınmadı" });
  }
});

// ─── Günlük Açot (Z-Report) ───────────────────────────────────────────────────
router.get("/daily-print", authenticate, requirePermission("reports:read"), async (req: Request, res: Response): Promise<void> => {
  const { date } = req.query as Record<string, string>;
  
  if (!date) {
    res.status(400).json({ success: false, error: "Tarix tələb olunur" });
    return;
  }

  const startOfDay = new Date(`${date}T00:00:00`);
  const endOfDay = new Date(`${date}T23:59:59`);

  try {
    const [sales, expenses, ustaOrders] = await Promise.all([
      prisma.sale.findMany({
        where: { soldAt: { gte: startOfDay, lte: endOfDay } },
        include: {
          seller: { select: { fullName: true } },
          payments: true
        },
        orderBy: { soldAt: "asc" }
      }),
      prisma.expense.findMany({
        where: { expenseDate: { gte: startOfDay, lte: endOfDay } },
        include: { user: { select: { fullName: true } } },
        orderBy: { expenseDate: "asc" }
      }),
      prisma.installationOrder.aggregate({
        where: { sale: { soldAt: { gte: startOfDay, lte: endOfDay } } },
        _sum: { totalFee: true }
      })
    ]);

    // Satışların icmalı
    let totalCash = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let totalDiscount = 0;
    let totalDeposit = 0;
    
    // Satışlardan və borc ödənişlərindən gələn cəmi
    for (const sale of sales) {
      totalDeposit += sale.deposit;
      totalDiscount += (sale.subtotal * (sale.discountPct ?? 0) / 100) + (sale.discountAmt ?? 0);
      
      for (const p of sale.payments) {
        if (p.paymentType === "CASH") totalCash += p.amount;
        if (p.paymentType === "CARD") totalCard += p.amount;
        if (p.paymentType === "TRANSFER") totalTransfer += p.amount;
      }
    }

    // Xərclərin icmalı
    let totalExpenses = 0;
    for (const expense of expenses) {
      totalExpenses += expense.amount;
    }

    // Xalis kassa (Nağd gəlirlər - Xərclər)
    const netCash = totalCash - totalExpenses;

    res.json({
      success: true,
      data: {
        date,
        totalSalesAmt: sales.reduce((s, x) => s + x.total, 0),
        totalDiscount,
        totalDeposit,
        totalCash,
        totalCard,
        totalTransfer,
        totalExpenses,
        totalUstaFees: ustaOrders?._sum?.totalFee ?? 0,
        netCash,
        salesCount: sales.length,
        sales: sales.map(s => ({
          saleNumber: s.saleNumber,
          total: s.total,
          deposit: s.deposit,
          debt: s.debt,
          sellerName: s.seller.fullName,
          time: s.soldAt.toISOString()
        })),
        expenses: expenses.map(e => ({
          category: e.category,
          amount: e.amount,
          description: e.description,
          userName: e.user.fullName,
          time: e.expenseDate.toISOString()
        }))
      }
    });

  } catch (err) {
    console.error("[daily-print error]", err);
    res.status(500).json({ success: false, error: "Açot məlumatları alınmadı" });
  }
});

export default router;
