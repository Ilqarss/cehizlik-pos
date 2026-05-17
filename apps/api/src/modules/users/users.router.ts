import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import type { UserRole } from "../../types";
import { prisma } from "../../db";
import { authenticate, requirePermission } from "../../middleware/auth";

const router = Router();
const validRoles: UserRole[] = ["ADMIN", "SELLER", "TAILOR", "USTA"];

router.get("/", authenticate, requirePermission("users:read"), async (req: Request, res: Response): Promise<void> => {
  try {
    const roleFilter = req.query.role ? { role: String(req.query.role) } : {};
    const users = await prisma.user.findMany({
      where: { isActive: true, ...roleFilter },
      select: { id: true, fullName: true, username: true, phone: true, role: true, commission: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, data: users });
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.get("/sellers", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const sellers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ["SELLER", "ADMIN"] } },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" }
    });
    res.json({ success: true, data: { items: sellers } });
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.get("/ustas", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const ustas = await prisma.user.findMany({
      where: { isActive: true, role: "USTA" },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" }
    });
    res.json({ success: true, data: { items: ustas } });
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.post("/", authenticate, requirePermission("users:write"), async (req: Request, res: Response): Promise<void> => {
  const { fullName, username, phone, password, role, commission } = req.body as {
    fullName?: string; username?: string; phone?: string; password?: string; role?: UserRole; commission?: number;
  };

  const trimmedFullName = fullName?.trim();
  const trimmedUsername = username?.trim().toLowerCase();
  const trimmedPhone = phone?.trim();

  if (!trimmedFullName || !trimmedUsername || !trimmedPhone || !password || !role) {
    res.status(400).json({ success: false, error: "Ad, istifadəçi adı, telefon, şifrə və rol tələb olunur" });
    return;
  }
  if (!validRoles.includes(role)) {
    res.status(400).json({ success: false, error: "Etibarsız rol: ADMIN, SELLER, TAILOR" });
    return;
  }

  // Unique yoxla - daha anlaşıqlı xəta üçün (yalnız aktiv userlər)
  try {
    const existingUsername = await prisma.user.findFirst({ where: { username: trimmedUsername, isActive: true } });
    if (existingUsername) {
      res.status(409).json({ success: false, error: "Bu istifadəçi adı artıq mövcuddur" });
      return;
    }
    const existingPhone = await prisma.user.findFirst({ where: { phone: trimmedPhone, isActive: true } });
    if (existingPhone) {
      res.status(409).json({ success: false, error: "Bu telefon nömrəsi artıq mövcuddur" });
      return;
    }
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
    return;
  }

  try {
    // Deaktiv eyni username/phone varsa, onların adını dəyiş ki, conflict olmasın
    await prisma.user.updateMany({
      where: { username: trimmedUsername, isActive: false },
      data: { username: `${trimmedUsername}_old_${Date.now()}` }
    });
    await prisma.user.updateMany({
      where: { phone: trimmedPhone, isActive: false },
      data: { phone: `${trimmedPhone}_old_${Date.now()}` }
    });

    const user = await prisma.user.create({
      data: {
        fullName: trimmedFullName,
        username: trimmedUsername,
        phone: trimmedPhone,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        commission: Number(commission ?? 0)
      },
      select: { id: true, fullName: true, username: true, phone: true, role: true, commission: true, isActive: true, createdAt: true }
    });
    res.status(201).json({ success: true, data: user });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      const fields = (e as { meta?: { target?: string[] } }).meta?.target ?? [];
      const fieldLabel = fields.includes("username")
        ? "Bu istifadəçi adı"
        : fields.includes("phone")
          ? "Bu telefon nömrəsi"
          : "Bu istifadəçi adı və ya telefon";
      res.status(409).json({ success: false, error: `${fieldLabel} artıq mövcuddur` });
      return;
    }
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.patch("/:id", authenticate, requirePermission("users:write"), async (req: Request, res: Response): Promise<void> => {
  const { fullName, username, phone, role, commission, isActive } = req.body as Partial<{
    fullName: string; username: string; phone: string; role: UserRole; commission: number; isActive: boolean;
  }>;

  if (role && !validRoles.includes(role)) {
    res.status(400).json({ success: false, error: "Etibarsız rol" });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { fullName, username: username?.toLowerCase(), phone, role, commission: commission !== undefined ? Number(commission) : undefined, isActive },
      select: { id: true, fullName: true, username: true, phone: true, role: true, commission: true, isActive: true, updatedAt: true }
    });
    res.json({ success: true, data: user });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2025") {
      res.status(404).json({ success: false, error: "İstifadəçi tapılmadı" });
      return;
    }
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.delete("/:id", authenticate, requirePermission("users:write"), async (req: Request, res: Response): Promise<void> => {
  try {
    // Özünü silə bilməz
    if (req.params.id === (req as any).user?.id) {
      res.status(400).json({ success: false, error: "Öz hesabınızı silə bilməzsiniz" });
      return;
    }
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({ success: true, data: { message: "İstifadəçi silindi" } });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "P2025") {
      res.status(404).json({ success: false, error: "İstifadəçi tapılmadı" });
      return;
    }
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

export default router;
