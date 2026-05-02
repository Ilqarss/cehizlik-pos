import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";

const router = Router();

function parseImages(images: unknown) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .filter((image): image is Record<string, unknown> => typeof image === "object" && image !== null)
    .map((image, index) => ({
      fileName: typeof image.fileName === "string" ? image.fileName : null,
      imageUrl: String(image.imageUrl ?? ""),
      contentType: typeof image.contentType === "string" ? image.contentType : null,
      isPrimary: Boolean(image.isPrimary ?? index === 0),
      sortOrder: typeof image.sortOrder === "number" ? image.sortOrder : index
    }))
    .filter((image) => image.imageUrl.length > 0);
}

router.use(authenticate);

router.get("/", requirePermission("products:read"), async (_req: Request, res: Response): Promise<void> => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        images: {
          orderBy: { sortOrder: "asc" }
        },
        stockAlerts: {
          where: { isResolved: false },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json({ success: true, data: { items: products } });
  } catch {
    res.status(500).json({ success: false, error: "Məhsullar alınmadı" });
  }
});

router.post("/", requirePermission("products:write"), async (req: Request, res: Response): Promise<void> => {
  const {
    nameAz,
    descriptionAz,
    barcode,
    sku,
    categoryId,
    brand,
    unitType,
    costPrice,
    salePrice,
    discountPrice,
    minStockLevel,
    currentStock,
    status,
    coverImageUrl,
    images
  } = req.body as Record<string, unknown>;

  if (!nameAz || !barcode || !categoryId || !unitType || costPrice === undefined || salePrice === undefined || !status) {
    res.status(400).json({ success: false, error: "Məhsul üçün vacib sahələr doldurulmalıdır" });
    return;
  }

  const imageRows = parseImages(images);

  try {
    const product = await prisma.product.create({
      data: {
        nameAz: String(nameAz),
        descriptionAz: descriptionAz ? String(descriptionAz) : null,
        barcode: String(barcode),
        sku: sku ? String(sku) : null,
        categoryId: String(categoryId),
        brand: brand ? String(brand) : null,
        unitType: String(unitType),
        costPrice: Number(costPrice),
        salePrice: Number(salePrice),
        discountPrice: discountPrice === null || discountPrice === undefined || discountPrice === "" ? null : Number(discountPrice),
        minStockLevel: Number(minStockLevel ?? 0),
        currentStock: Number(currentStock ?? 0),
        status: String(status) as "ACTIVE" | "INACTIVE" | "ARCHIVED",
        coverImageUrl: coverImageUrl ? String(coverImageUrl) : imageRows.find((image) => image.isPrimary)?.imageUrl ?? null,
        createdById: (req as any).user?.id,
        updatedById: (req as any).user?.id,
        images: imageRows.length
          ? {
              create: imageRows
            }
          : undefined,
        stockAlerts:
          Number(currentStock ?? 0) <= Number(minStockLevel ?? 0)
            ? {
                create: {
                  alertType: Number(currentStock ?? 0) === 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
                  thresholdValue: Number(minStockLevel ?? 0),
                  currentStock: Number(currentStock ?? 0),
                  note: "Məhsul minimum stok həddinə çatıb"
                }
              }
            : undefined
      },
      include: {
        category: true,
        images: true,
        stockAlerts: true
      }
    });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      res.status(409).json({ success: false, error: "Barkod və ya SKU artıq mövcuddur" });
      return;
    }

    res.status(500).json({ success: false, error: "Məhsul yaradıla bilmədi" });
  }
});

router.patch("/:id", requirePermission("products:write"), async (req: Request, res: Response): Promise<void> => {
  const imageRows = parseImages(req.body.images);

  try {
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { images: true }
    });

    if (!existing) {
      res.status(404).json({ success: false, error: "Məhsul tapılmadı" });
      return;
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        costPrice: req.body.costPrice !== undefined ? Number(req.body.costPrice) : undefined,
        salePrice: req.body.salePrice !== undefined ? Number(req.body.salePrice) : undefined,
        discountPrice:
          req.body.discountPrice === "" ? null : req.body.discountPrice !== undefined ? Number(req.body.discountPrice) : undefined,
        minStockLevel: req.body.minStockLevel !== undefined ? Number(req.body.minStockLevel) : undefined,
        currentStock: req.body.currentStock !== undefined ? Number(req.body.currentStock) : undefined,
        updatedById: (req as any).user?.id,
        images: imageRows.length
          ? {
              deleteMany: {},
              create: imageRows
            }
          : undefined
      },
      include: {
        category: true,
        images: true,
        stockAlerts: true
      }
    });

    if (product.currentStock <= product.minStockLevel) {
      await prisma.stockAlert.create({
        data: {
          productId: product.id,
          alertType: product.currentStock === 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
          thresholdValue: product.minStockLevel,
          currentStock: product.currentStock,
          note: "Məhsul yenilənəndən sonra aşağı stok aşkarlanıb"
        }
      }).catch(() => undefined);
    }

    res.json({ success: true, data: product });
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2025") {
      res.status(404).json({ success: false, error: "Məhsul tapılmadı" });
      return;
    }

    res.status(500).json({ success: false, error: "Məhsul yenilənmədi" });
  }
});

router.delete("/:id", requirePermission("products:write"), async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2025") {
      res.status(404).json({ success: false, error: "Məhsul tapılmadı" });
      return;
    }

    res.status(500).json({ success: false, error: "Məhsul silinmədi" });
  }
});

router.post("/:id/images", requirePermission("products:write"), async (req: Request, res: Response): Promise<void> => {
  const { fileName, imageUrl, contentType, isPrimary } = req.body as {
    fileName?: string;
    imageUrl?: string;
    contentType?: string;
    isPrimary?: boolean;
  };

  if (!imageUrl) {
    res.status(400).json({ success: false, error: "Şəkil URL-i və ya data URL tələb olunur" });
    return;
  }

  try {
    if (isPrimary) {
      await prisma.productImage.updateMany({
        where: { productId: req.params.id },
        data: { isPrimary: false }
      });
    }

    const image = await prisma.productImage.create({
      data: {
        productId: req.params.id,
        fileName: fileName ?? null,
        imageUrl,
        contentType: contentType ?? null,
        isPrimary: Boolean(isPrimary)
      }
    });

    if (image.isPrimary) {
      await prisma.product.update({
        where: { id: req.params.id },
        data: { coverImageUrl: image.imageUrl, updatedById: (req as any).user?.id }
      });
    }

    res.status(201).json({ success: true, data: image });
  } catch {
    res.status(500).json({ success: false, error: "Məhsul şəkli əlavə olunmadı" });
  }
});

export default router;