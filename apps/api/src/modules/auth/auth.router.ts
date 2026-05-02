import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../db";
import { authenticate } from "../../middleware/auth";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt";

const router = Router();

function buildFilter(login: string) {
  if (/^\+?\d+$/.test(login)) return { phone: login };
  return { username: login.toLowerCase() };
}

router.post("/login", async (req: Request, res: Response): Promise<void> => {
  const { login, password } = req.body as { login?: string; password?: string };

  if (!login || !password) {
    res.status(400).json({ success: false, error: "İstifadəçi adı və şifrə tələb olunur" });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { isActive: true, ...buildFilter(login.trim()) }
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({ success: false, error: "Giriş məlumatları yanlışdır", code: "INVALID_CREDENTIALS" });
      return;
    }

    const accessToken = signAccessToken(user.id, user.role, user.username);
    const refreshToken = signRefreshToken(user.id);
    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, fullName: user.fullName, username: user.username, phone: user.phone, role: user.role, commission: user.commission, isActive: user.isActive }
      }
    });
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ success: false, error: "Refresh token tələb olunur" });
    return;
  }
  try {
    const payload = verifyRefreshToken(refreshToken);
    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const session = await prisma.session.findFirst({
      where: { userId: payload.sub, refreshTokenHash: hash, expiresAt: { gt: new Date() } }
    });
    if (!session) {
      res.status(401).json({ success: false, error: "Sessiya etibarsızdır", code: "SESSION_EXPIRED" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: "İstifadəçi tapılmadı", code: "USER_NOT_FOUND" });
      return;
    }
    res.json({ success: true, data: { accessToken: signAccessToken(user.id, user.role, user.username) } });
  } catch {
    res.status(401).json({ success: false, error: "Refresh token etibarsızdır", code: "INVALID_TOKEN" });
  }
});

router.post("/logout", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    const hash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    await prisma.session.deleteMany({ where: { userId: (req as any).user?.id, refreshTokenHash: hash } });
  }
  res.json({ success: true, data: null });
});

router.get("/me", authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user?.id },
      select: { id: true, fullName: true, username: true, phone: true, role: true, commission: true, isActive: true }
    });
    if (!user) {
      res.status(404).json({ success: false, error: "İstifadəçi tapılmadı" });
      return;
    }
    res.json({ success: true, data: user });
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

router.patch("/change-password", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ success: false, error: "Yeni şifrə ən az 6 simvol olmalıdır" });
    return;
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: (req as any).user?.id } });
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      res.status(401).json({ success: false, error: "Cari şifrə yanlışdır" });
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(newPassword, 12) } });
    res.json({ success: true, data: { message: "Şifrə yeniləndi" } });
  } catch {
    res.status(500).json({ success: false, error: "Server xətası" });
  }
});

export default router;
