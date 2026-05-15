import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";
import type { UserRole } from "../../types";

const router = Router();
router.use(authenticate);

// ─── Satışlar siyahısı ────────────────────────────────────────────────────────
router.get("/", requirePermission("sales:read"), async (req: Request, res: Response): Promise<void> => {
  const { page = "1", limit = "30", from, to, sellerId } = req.query as Record<string, string>;
  const skip = (Number(page) - 1) * Number(limit);
  const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.soldAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {})
    };
  }
  // Satici yalniz oz satislarini gorur
  if (!isAdmin) where.sellerId = (req as any).user?.id;
  else if (sellerId) where.sellerId = sellerId;

  try {
    const [items, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { soldAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          seller: { select: { id: true, fullName: true } },
          items: true,
          payments: true
        }
      }),
      prisma.sale.count({ where })
    ]);

    // Satıcıdan mənfəəti gizlət
    const sanitized = items.map(sale => {
      if (!isAdmin) {
        const { profitAmt: _p, ...rest } = sale as any;
        return rest;
      }
      return sale;
    });

    res.json({ success: true, data: { items: sanitized, total } });
  } catch {
    res.status(500).json({ success: false, error: "Satışlar alınmadı" });
  }
});

// ─── Tək satış ────────────────────────────────────────────────────────────────
router.get("/:id", requirePermission("sales:read"), async (req: Request, res: Response): Promise<void> => {
  const isAdmin = ((req as any).user?.role as UserRole) === "ADMIN";
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        seller: { select: { id: true, fullName: true, role: true } },
        items: { include: { product: { select: { id: true, nameAz: true, code: true, unit: true } } } },
        payments: true,
        tailorOrders: true
      }
    });
    if (!sale) {
      res.status(404).json({ success: false, error: "Satis tapilmadi" });
      return;
    }
    if (!isAdmin && sale.sellerId !== (req as any).user?.id) {
      res.status(403).json({ success: false, error: "Bu satisa giris yoxdur" });
      return;
    }
    if (!isAdmin) {
      const { profitAmt: _p, ...rest } = sale as any;
      res.json({ success: true, data: rest });
      return;
    }
    res.json({ success: true, data: sale });
  } catch {
    res.status(500).json({ success: false, error: "Satış alınmadı" });
  }
});

// ─── Yeni satış ───────────────────────────────────────────────────────────────
router.post("/", requirePermission("sales:create"), async (req: Request, res: Response): Promise<void> => {
  const {
    customerId, customerName, customerPhone,
    items, payments,
    discountPct = 0, discountAmt = 0,
    deposit = 0,
    note, receiptWidth = "80mm",
    createTailorOrders = false
  } = req.body as {
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    items: Array<{
      productId: string;
      meters?: number; buzmeFactor?: number;
      widthM?: number; heightM?: number;
      quantity?: number;
      discountAmt?: number;
      tailorNote?: string; tailorModel?: string; tailorColor?: string; tailorDueDate?: string; tailorId?: string;
    }>;
    payments: Array<{ paymentType: string; amount: number; note?: string }>;
    discountPct?: number;
    discountAmt?: number;
    deposit?: number;
    note?: string;
    receiptWidth?: string;
    createTailorOrders?: boolean;
    sellerId?: string;
  };

  if (!items || items.length === 0) {
    res.status(400).json({ success: false, error: "Ən az bir məhsul tələb olunur" });
    return;
  }

  // Ayarları yoxla (endirim limiti və dərzi bonusları)
  let straightBonus = 0.03;
  let buzmeBonus = 0.06;
  try {
    const [maxDiscountSetting, straightSetting, buzmeSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "max_discount_pct" } }),
      prisma.setting.findUnique({ where: { key: "tailor_straight_bonus" } }),
      prisma.setting.findUnique({ where: { key: "tailor_buzme_bonus" } })
    ]);
    
    if (maxDiscountSetting) {
      const maxPct = Number(maxDiscountSetting.value);
      if (!isNaN(maxPct) && Number(discountPct) > maxPct) {
        res.status(400).json({
          success: false,
          error: `Endirim faizi maksimum ${maxPct}% ola bilər`
        });
        return;
      }
    }
    
    if (straightSetting && !isNaN(Number(straightSetting.value))) {
      straightBonus = Number(straightSetting.value);
    }
    if (buzmeSetting && !isNaN(Number(buzmeSetting.value))) {
      buzmeBonus = Number(buzmeSetting.value);
    }
  } catch {
    // ayar tapılmasa keçir
  }

  try {
    // Məhsulları oxu
    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const productMap = new Map(products.map(p => [p.id, p]));

    // Hesablamalar
    let subtotal = 0;
    let totalCost = 0;
    const saleItems: Array<{
      productId: string; productNameSnap: string; productCodeSnap: string; unitSnap: string;
      salePriceSnap: number; costPriceSnap: number;
      meters?: number; buzmeFactor?: number;
      widthM?: number; heightM?: number; squareM?: number;
      quantity: number; lineTotal: number; discountAmt: number;
    }> = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) continue;

      let lineTotal = 0;
      let qty = 1;
      let squareM: number | undefined;

      if (product.productType === "CURTAIN" && item.meters && item.buzmeFactor) {
        lineTotal = item.meters * item.buzmeFactor * product.salePrice;
        qty = item.meters * item.buzmeFactor;
      } else if (product.productType === "JALOUSIE" && item.widthM && item.heightM) {
        squareM = Math.max(item.widthM * item.heightM, 1);
        lineTotal = squareM * product.salePrice;
        qty = squareM;
      } else {
        qty = item.quantity ?? 1;
        lineTotal = qty * product.salePrice;
      }

      lineTotal -= item.discountAmt ?? 0;
      lineTotal = Math.max(lineTotal, 0);
      subtotal += lineTotal;
      totalCost += qty * product.costPrice;

      saleItems.push({
        productId: item.productId,
        productNameSnap: product.nameAz,
        productCodeSnap: product.code,
        unitSnap: product.unit,
        salePriceSnap: product.salePrice,
        costPriceSnap: product.costPrice,
        meters: item.meters,
        buzmeFactor: item.buzmeFactor,
        widthM: item.widthM,
        heightM: item.heightM,
        squareM,
        quantity: qty,
        lineTotal,
        discountAmt: item.discountAmt ?? 0
      });
    }

    // Ümumi endirim
    const afterPct = subtotal - (subtotal * Number(discountPct)) / 100;
    const total = Math.max(afterPct - Number(discountAmt), 0);
    const totalPaid = (payments || []).reduce((acc, p) => acc + Number(p.amount), 0);
    const debt = Math.max(total - Number(deposit) - totalPaid, 0);
    const profitAmt = total - totalCost;

    // Müştəri tapıb/yarat
    let finalCustomerId = customerId;
    if (!finalCustomerId && customerPhone) {
      const existing = await prisma.customer.findUnique({ where: { phone: customerPhone } });
      if (existing) {
        finalCustomerId = existing.id;
      } else if (customerName) {
        const newCustomer = await prisma.customer.create({
          data: { name: customerName, phone: customerPhone }
        });
        finalCustomerId = newCustomer.id;
      }
    }

    // Əməliyyat
    const sale = await prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          sellerId: req.body.sellerId || (req as any).user?.id,
          customerId: finalCustomerId ?? null,
          subtotal,
          discountPct: Number(discountPct),
          discountAmt: Number(discountAmt),
          total,
          deposit: Number(deposit),
          debt,
          profitAmt,
          note: note ?? null,
          receiptWidth,
          items: { create: saleItems }
        },
        include: {
          items: true,
          customer: true,
          seller: { select: { id: true, fullName: true } }
        }
      });

      // Ödənişlər
      if (payments && payments.length > 0) {
        await tx.salePayment.createMany({
          data: payments.map(p => ({
            saleId: newSale.id,
            paymentType: p.paymentType as "CASH" | "CARD" | "TRANSFER",
            amount: Number(p.amount),
            note: p.note ?? null
          }))
        });
      }

      // Stok azalt
      for (const item of newSale.items) {
        const before = productMap.get(item.productId)!.stock;
        const after = Math.max(0, before - item.quantity);
        await tx.product.update({ where: { id: item.productId }, data: { stock: after } });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            delta: -item.quantity,
            beforeStock: before,
            afterStock: after,
            reason: "Satış",
            referenceId: newSale.id
          }
        });
      }

      // Müştərinin borcunu yenilə
      if (finalCustomerId && debt > 0) {
        await tx.customer.update({
          where: { id: finalCustomerId },
          data: { totalDebt: { increment: debt } }
        });
      }

      // Dərzi sifarişi yarat
      if (createTailorOrders) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const saleItem = newSale.items[i];
          if (!saleItem) continue;
          const product = productMap.get(item.productId);
          if (product?.productType === "CURTAIN") {
            const isBuzme = (item.buzmeFactor ?? 1) > 1;
            const appliedBonusPerUnit = isBuzme ? buzmeBonus : straightBonus;
            
            await tx.tailorOrder.create({
              data: {
                saleId: newSale.id,
                saleItemId: saleItem.id,
                tailorId: item.tailorId ?? null,
                meters: item.meters,
                buzmeFactor: item.buzmeFactor,
                model: item.tailorModel ?? null,
                color: item.tailorColor ?? null,
                customNote: item.tailorNote ?? null,
                dueDate: item.tailorDueDate ? new Date(item.tailorDueDate) : null,
                status: "WAITING",
                stitchType: isBuzme ? "buzme" : "straight",
                bonusPerUnit: appliedBonusPerUnit,
                totalBonus: (item.meters ?? 0) * appliedBonusPerUnit
              }
            });
          }
        }
      }

      return newSale;
    });

    res.status(201).json({ success: true, data: sale });
  } catch (err: any) {
    console.error("[sales/create]", err);
    res.status(500).json({ success: false, error: `Satış yaradılmadı: ${err?.message ?? "Bilinməyən xəta"}` });
  }
});

// ─── Borc ödə ─────────────────────────────────────────────────────────────────
router.post("/:id/pay-debt", requirePermission("sales:create"), async (req: Request, res: Response): Promise<void> => {
  const { amount, paymentType, note } = req.body as { amount?: number; paymentType?: string; note?: string };
  if (!amount || amount <= 0) {
    res.status(400).json({ success: false, error: "Ödəniş məbləği tələb olunur" });
    return;
  }
  try {
    const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
    if (!sale) {
      res.status(404).json({ success: false, error: "Satış tapılmadı" });
      return;
    }
    const paid = Math.min(Number(amount), sale.debt);
    const newDebt = Math.max(sale.debt - paid, 0);

    await prisma.$transaction([
      prisma.sale.update({ where: { id: sale.id }, data: { debt: newDebt, deposit: { increment: paid } } }),
      prisma.salePayment.create({
        data: {
          saleId: sale.id,
          paymentType: (paymentType ?? "CASH") as "CASH" | "CARD" | "TRANSFER",
          amount: paid,
          note: note ?? "Borc ödəmə"
        }
      }),
      ...(sale.customerId && paid > 0
        ? [prisma.customer.update({ where: { id: sale.customerId }, data: { totalDebt: { decrement: paid } } })]
        : [])
    ]);

    res.json({ success: true, data: { newDebt, paid } });
  } catch {
    res.status(500).json({ success: false, error: "Ödəniş qeyd olunmadı" });
  }
});

export default router;
