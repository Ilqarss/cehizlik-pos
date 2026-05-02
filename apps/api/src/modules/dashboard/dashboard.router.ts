import { Router, type Request, type Response } from "express";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";

const router = Router();

router.get("/overview", authenticate, requirePermission("dashboard:view"), async (req: Request, res: Response): Promise<void> => {
  try {
    const [products, activeCashiers, categoriesCount] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          nameAz: true,
          barcode: true,
          currentStock: true,
          minStockLevel: true
        }
      }),
      prisma.user.count({
        where: {
          role: "CASHIER",
          isActive: true
        }
      }),
      prisma.category.count()
    ]);

    const lowStockProducts = products
      .filter((product) => product.currentStock <= product.minStockLevel)
      .sort((left, right) => left.currentStock - right.currentStock)
      .slice(0, 6);

    res.json({
      success: true,
      data: {
        storeName: "İL & AY",
        receiptSupport: ["Brauzer çapı", "58mm termal", "80mm termal"],
        summary: {
          todaySales: 0,
          orderCount: 0,
          lowStockCount: lowStockProducts.length,
          activeCashiers,
          productsCount: products.length,
          categoriesCount
        },
        lowStockProducts,
        currentUserRole: (req as any).user?.role
      }
    });
  } catch {
    res.status(500).json({ success: false, error: "Dashboard məlumatları alınmadı" });
  }
});

export default router;