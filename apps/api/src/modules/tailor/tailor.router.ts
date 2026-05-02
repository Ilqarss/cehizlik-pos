import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";
import type { UserRole } from "../../types";

const router = Router();
router.use(authenticate);

// ─── Dərzi siyahısı (bütün rollar üçün) ───────────────────────────────────────
router.get("/tailors", async (_req: Request, res: Response): Promise<void> => {
  try {
    const tailors = await prisma.user.findMany({
      where: { role: "TAILOR", isActive: true },
      select: { id: true, fullName: true }
    });
    res.json({ success: true, data: { items: tailors } });
  } catch {
    res.status(500).json({ success: false, error: "Dərzi siyahısı alınmadı" });
  }
});

// ─── Siyahı ───────────────────────────────────────────────────────────────────
router.get("/", requirePermission("tailor:read"), async (req: Request, res: Response): Promise<void> => {
  const { status, page = "1", limit = "50" } = req.query as Record<string, string>;
  const role = (req as any).user?.role as UserRole;
  const skip = (Number(page) - 1) * Number(limit);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  // Derzi yalniz ozune atanmis sifarisleri gorur
  if (role === "TAILOR") where.tailorId = (req as any).user?.id;

  try {
    const [items, total] = await Promise.all([
      prisma.tailorOrder.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          sale: {
            select: {
              id: true, saleNumber: true, soldAt: true,
              customer: { select: { id: true, name: true, phone: true } }
            }
          },
          tailor: { select: { id: true, fullName: true } }
        }
      }),
      prisma.tailorOrder.count({ where })
    ]);

    res.json({ success: true, data: { items, total } });
  } catch {
    res.status(500).json({ success: false, error: "Dərzi sifarişləri alınmadı" });
  }
});

// ─── Status yenilə (Dərzi öz sifarişini yeniləyir) ────────────────────────────
router.patch("/:id/status", requirePermission("tailor:write"), async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body as { status?: string };
  if (!status || !["WAITING", "IN_PROGRESS", "READY"].includes(status)) {
    res.status(400).json({ success: false, error: "Etibarlı status: WAITING, IN_PROGRESS, READY" });
    return;
  }

  const role = (req as any).user?.role as UserRole;

  try {
    const order = await prisma.tailorOrder.findUnique({ where: { id: req.params.id } });
    if (!order) {
      res.status(404).json({ success: false, error: "Sifaris tapilmadi" });
      return;
    }
    // Derzi yalniz ozune aid sifaris yenileyebiler
    if (role === "TAILOR" && order.tailorId !== (req as any).user?.id) {
      res.status(403).json({ success: false, error: "Bu sifariş sizə aid deyil" });
      return;
    }

    const updated = await prisma.tailorOrder.update({
      where: { id: req.params.id },
      data: {
        status: status as "WAITING" | "IN_PROGRESS" | "READY",
        completedAt: status === "READY" ? new Date() : null
      }
    });

    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: "Status yenilənmədi" });
  }
});

// ─── Dərziyə at (yalnız Admin) ────────────────────────────────────────────────
router.patch("/:id/assign", requirePermission("tailor:assign"), async (req: Request, res: Response): Promise<void> => {
  const { tailorId } = req.body as { tailorId?: string };
  if (!tailorId) {
    res.status(400).json({ success: false, error: "Dərzi ID tələb olunur" });
    return;
  }
  try {
    const updated = await prisma.tailorOrder.update({
      where: { id: req.params.id },
      data: { tailorId }
    });
    res.json({ success: true, data: updated });
  } catch {
    res.status(500).json({ success: false, error: "Atama alınmadı" });
  }
});

// ─── Dərzi sifarişi yarat / yenilə (Admin/Seller) ─────────────────────────────
router.post("/", requirePermission("tailor:write"), async (req: Request, res: Response): Promise<void> => {
  const { saleId, saleItemId, tailorId, customNote, width, height, meters, buzmeFactor, model, color, dueDate } = req.body as Record<string, unknown>;

  try {
    const order = await prisma.tailorOrder.create({
      data: {
        saleId: saleId ? String(saleId) : null,
        saleItemId: saleItemId ? String(saleItemId) : null,
        tailorId: tailorId ? String(tailorId) : null,
        customNote: customNote ? String(customNote) : null,
        width: width !== undefined ? Number(width) : null,
        height: height !== undefined ? Number(height) : null,
        meters: meters !== undefined ? Number(meters) : null,
        buzmeFactor: buzmeFactor !== undefined ? Number(buzmeFactor) : null,
        model: model ? String(model) : null,
        color: color ? String(color) : null,
        dueDate: dueDate ? new Date(String(dueDate)) : null,
        status: "WAITING"
      }
    });
    res.status(201).json({ success: true, data: order });
  } catch {
    res.status(500).json({ success: false, error: "Dərzi sifarişi yaradılmadı" });
  }
});

export default router;
