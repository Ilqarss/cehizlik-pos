import type { NextFunction, Request, Response } from "express";
import { hasPermission, type Permission, type UserRole } from "../types";
import { verifyAccessToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole; username: string };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Giriş tələb olunur", code: "UNAUTHORIZED" });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role as UserRole, username: payload.username };
    next();
  } catch {
    res.status(401).json({ success: false, error: "Token etibarsızdır", code: "INVALID_TOKEN" });
  }
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: "Giriş tələb olunur", code: "UNAUTHORIZED" });
      return;
    }

    if (!hasPermission(req.user.role, permission)) {
      res.status(403).json({
        success: false,
        error: "Bu əməliyyat üçün icazəniz yoxdur",
        code: "FORBIDDEN"
      });
      return;
    }

    next();
  };
}
