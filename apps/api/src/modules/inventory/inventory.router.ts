import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";
import type { UserRole } from "../../types";

const router = Router();
router.use(authenticate);

// ─── Anbar siyahısı ───────────────────────────────────────────────────────────
router.get("/", requirePermission("inventory:read"), async (req: Request, res: Response): Promise<void> => {
  const { q, type, page = "1", limit = "50" } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";

  try {
    const where: Record<string, unknown> = { isActive: true };
    if (q) where.OR = [{ nameAz: { contains: q } }, { code: { contains: q } }];
    if (type) where.productType = type;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { nameAz: "asc" },
        select: {
          id: true, code: true, nameAz: true, productType: true,
          unit: true, salePrice: true, stock: true, minStock: true, isActive: true,
          // Alış qiymətini yalnız Admin görür
          ...(isAdmin ? { costPrice: true, marginPct: true } : {})
        }
      }),
      prisma.product.count({ where })
    ]);

    res.json({ success: true, data: { items, total } });
  } catch {
    res.status(500).json({ success: false, error: "Anbar alınmadı" });
  }
});

// ─── Tək məhsul ───────────────────────────────────────────────────────────────
router.get("/:id", requirePermission("inventory:read"), async (req: Request, res: Response): Promise<void> => {
  const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        movements: { orderBy: { createdAt: "desc" }, take: 30 }
      }
    });
    if (!product) {
      res.status(404).json({ success: false, error: "Məhsul tapılmadı" });
      return;
    }
    if (!isAdmin) {
      const { costPrice: _c, marginPct: _m, ...safe } = product as any;
      res.json({ success: true, data: safe });
      return;
    }
    res.json({ success: true, data: product });
  } catch {
    res.status(500).json({ success: false, error: "Məhsul alınmadı" });
  }
});

// ─── Yeni məhsul ──────────────────────────────────────────────────────────────
router.post("/", requirePermission("inventory:write"), async (req: Request, res: Response): Promise<void> => {
  const { code, nameAz, productType, unit, costPrice, marginPct, salePrice, stock, minStock } = req.body as Record<string, unknown>;

  if (!nameAz || salePrice === undefined) {
    res.status(400).json({ success: false, error: "Ad və satış qiyməti tələb olunur" });
    return;
  }

  // Kod boşdursa avtomatik yarat
  let finalCode = code ? String(code) : "";
  if (!finalCode) {
    const count = await prisma.product.count();
    const prefix = String(productType ?? "OTHER") === "CURTAIN" ? "PD" : String(productType ?? "OTHER") === "JALOUSIE" ? "JL" : "ML";
    finalCode = `${prefix}-${String(count + 1).padStart(4, "0")}`;
  }

  try {
    const product = await prisma.product.create({
      data: {
        code: finalCode,
        nameAz: String(nameAz),
        productType: String(productType ?? "OTHER") as "CURTAIN" | "JALOUSIE" | "OTHER",
        unit: String(unit ?? "ədəd"),
        costPrice: Number(costPrice ?? 0),
        marginPct: Number(marginPct ?? 0),
        salePrice: Number(salePrice),
        stock: Number(stock ?? 0),
        minStock: Number(minStock ?? 0)
      }
    });

    if (Number(stock ?? 0) > 0) {
      await prisma.stockMovement.create({
        data: {
          productId: product.id,
          delta: Number(stock ?? 0),
          beforeStock: 0,
          afterStock: Number(stock ?? 0),
          reason: "İlkin stok"
        }
      });
    }

    res.status(201).json({ success: true, data: product });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      res.status(409).json({ success: false, error: "Bu kod artıq mövcuddur" });
      return;
    }
    res.status(500).json({ success: false, error: "Məhsul yaradılmadı" });
  }
});

// ─── Məhsul yenilə ────────────────────────────────────────────────────────────
router.patch("/:id", requirePermission("inventory:write"), async (req: Request, res: Response): Promise<void> => {
  const { nameAz, productType, unit, costPrice, marginPct, salePrice, minStock, isActive } = req.body as Record<string, unknown>;
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        nameAz: nameAz ? String(nameAz) : undefined,
        productType: productType ? String(productType) as "CURTAIN" | "JALOUSIE" | "OTHER" : undefined,
        unit: unit ? String(unit) : undefined,
        costPrice: costPrice !== undefined ? Number(costPrice) : undefined,
        marginPct: marginPct !== undefined ? Number(marginPct) : undefined,
        salePrice: salePrice !== undefined ? Number(salePrice) : undefined,
        minStock: minStock !== undefined ? Number(minStock) : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined
      }
    });
    res.json({ success: true, data: product });
  } catch {
    res.status(500).json({ success: false, error: "Məhsul yenilənmədi" });
  }
});

// ─── Stok düzəlişi (manual) ───────────────────────────────────────────────────
router.post("/adjust", requirePermission("inventory:write"), async (req: Request, res: Response): Promise<void> => {
  const { productId, delta, reason } = req.body as { productId?: string; delta?: number; reason?: string };
  if (!productId || delta === undefined) {
    res.status(400).json({ success: false, error: "Məhsul ID və dəyişim tələb olunur" });
    return;
  }
  try {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      res.status(404).json({ success: false, error: "Məhsul tapılmadı" });
      return;
    }
    const newStock = Math.max(0, product.stock + Number(delta));
    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { stock: newStock } }),
      prisma.stockMovement.create({
        data: {
          productId,
          delta: Number(delta),
          beforeStock: product.stock,
          afterStock: newStock,
          reason: reason ?? "Manual düzəliş"
        }
      })
    ]);
    res.json({ success: true, data: { newStock } });
  } catch {
    res.status(500).json({ success: false, error: "Stok düzəlişi alınmadı" });
  }
});

// ─── CSV/Excel import (Access-dən gelen: Kod, Ad, Alış, Faiz, Satış, Qalıq, Vahidi) ───
router.post("/import", requirePermission("inventory:import"), async (req: Request, res: Response): Promise<void> => {
  const { rows } = req.body as {
    rows?: Array<{
      code: string; nameAz: string; costPrice?: number; marginPct?: number;
      salePrice: number; stock?: number; unit?: string; productType?: string;
    }>;
  };

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ success: false, error: "Data sətirləri tələb olunur" });
    return;
  }

  let created = 0, updated = 0, errors = 0;
  const errorList: string[] = [];

  for (const row of rows) {
    try {
      const existing = await prisma.product.findUnique({ where: { code: String(row.code) } });
      if (existing) {
        await prisma.product.update({
          where: { code: String(row.code) },
          data: {
            nameAz: row.nameAz,
            costPrice: Number(row.costPrice ?? 0),
            marginPct: Number(row.marginPct ?? 0),
            salePrice: Number(row.salePrice),
            stock: Number(row.stock ?? 0),
            unit: row.unit ?? "ədəd",
            productType: (row.productType ?? "OTHER") as "CURTAIN" | "JALOUSIE" | "OTHER"
          }
        });
        updated++;
      } else {
        await prisma.product.create({
          data: {
            code: String(row.code),
            nameAz: row.nameAz,
            productType: (row.productType ?? "OTHER") as "CURTAIN" | "JALOUSIE" | "OTHER",
            unit: row.unit ?? "ədəd",
            costPrice: Number(row.costPrice ?? 0),
            marginPct: Number(row.marginPct ?? 0),
            salePrice: Number(row.salePrice),
            stock: Number(row.stock ?? 0)
          }
        });
        created++;
      }
    } catch {
      errors++;
      errorList.push(`${row.code}: import xətası`);
    }
  }

  res.json({ success: true, data: { created, updated, errors, errorList } });
});

// ─── Aşağı stok ───────────────────────────────────────────────────────────────
router.get("/status/low-stock", requirePermission("inventory:read"), async (_req: Request, res: Response): Promise<void> => {
  try {
    const items = await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, code: true, nameAz: true, unit: true, stock: true, minStock: true }
    });
    const low = items.filter(p => p.stock <= p.minStock);
    res.json({ success: true, data: { items: low } });
  } catch {
    res.status(500).json({ success: false, error: "Aşağı stok alınmadı" });
  }
});

// ─── Mal silmə (yalnız Admin) ──────────────────────────────────────────────────
router.delete("/:id", requirePermission("inventory:write"), async (req: Request, res: Response): Promise<void> => {
  const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";
  if (!isAdmin) {
    res.status(403).json({ success: false, error: "Yalnız admin malı silə bilər" });
    return;
  }

  try {
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ success: true, data: { message: "Mal silindi" } });
  } catch {
    res.status(500).json({ success: false, error: "Mal silinmədi" });
  }
});

export default router;
