import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";
import type { UserRole } from "../../types";

const router = Router();
router.use(authenticate);

// ─── Xərcləri gör ─────────────────────────────────────────────────────────────
router.get("/", requirePermission("expenses:read"), async (req: Request, res: Response): Promise<void> => {
  const { from, to, page = "1", limit = "50" } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.expenseDate = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {})
    };
  }
  // Satici yalniz oz xercini gorur
  if (!isAdmin) where.recordedBy = (req as any).user?.id;

  try {
    const [items, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { expenseDate: "desc" },
        include: { user: { select: { id: true, fullName: true } } }
      }),
      prisma.expense.count({ where })
    ]);
    res.json({ success: true, data: { items, total } });
  } catch {
    res.status(500).json({ success: false, error: "Xərclər alınmadı" });
  }
});

// ─── Xərc əlavə et ────────────────────────────────────────────────────────────
router.post("/", requirePermission("expenses:write"), async (req: Request, res: Response): Promise<void> => {
  const { category, amount, description, expenseDate } = req.body as Record<string, unknown>;
  if (!category || !amount) {
    res.status(400).json({ success: false, error: "Kateqoriya və məbləğ tələb olunur" });
    return;
  }
  try {
    const expense = await prisma.expense.create({
      data: {
        category: String(category),
        amount: Number(amount),
        description: description ? String(description) : null,
        recordedBy: (req as any).user?.id,
        expenseDate: expenseDate ? new Date(String(expenseDate)) : new Date()
      }
    });
    res.status(201).json({ success: true, data: expense });
  } catch {
    res.status(500).json({ success: false, error: "Xərc əlavə olunmadı" });
  }
});

// ─── Xərc sil ─────────────────────────────────────────────────────────────────
router.delete("/:id", requirePermission("expenses:write"), async (req: Request, res: Response): Promise<void> => {
  try {
    const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!expense) {
      res.status(404).json({ success: false, error: "Xərc tapılmadı" });
      return;
    }
    const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";
    if (!isAdmin && expense.recordedBy !== (req as any).user?.id) {
      res.status(403).json({ success: false, error: "Bu xərci silmək icazəniz yoxdur" });
      return;
    }
    await prisma.expense.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { deleted: true } });
  } catch {
    res.status(500).json({ success: false, error: "Xərc silinmədi" });
  }
});

export default router;
