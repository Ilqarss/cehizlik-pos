import jwt from "jsonwebtoken";
import type { UserRole } from "../types";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
const ACCESS_EXPIRES = "8h";
const REFRESH_EXPIRES = "30d";

export type AccessPayload = {
  sub: string;
  role: UserRole;
  username: string;
  iat?: number;
  exp?: number;
};

export type RefreshPayload = {
  sub: string;
  iat?: number;
  exp?: number;
};

export function signAccessToken(userId: string, role: UserRole, username: string): string {
  return jwt.sign({ sub: userId, role, username } satisfies AccessPayload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRES
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId } satisfies RefreshPayload, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessPayload;
}

export function verifyRefreshToken(token: string): RefreshPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshPayload;
}
