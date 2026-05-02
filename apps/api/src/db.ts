import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient;

const isProduction = process.env.NODE_ENV === "production";
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (isProduction && tursoUrl && tursoToken) {
  // Turso (LibSQL) adapter
  try {
    const { PrismaLibSQL } = require("@prisma/adapter-libsql");
    const { createClient } = require("@libsql/client");
    const libsql = createClient({ url: tursoUrl, authToken: tursoToken });
    const adapter = new PrismaLibSQL(libsql);
    prisma = new PrismaClient({ adapter } as any);
  } catch {
    // Fallback to regular Prisma if adapter not installed
    prisma = new PrismaClient();
  }
} else {
  // Local SQLite
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith("file:./")) {
    const dir = typeof __dirname !== "undefined"
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
    const dbAbsPath = path.resolve(dir, "../prisma/dev.db").replace(/\\/g, "/");
    process.env.DATABASE_URL = `file:${dbAbsPath}`;
  }

  declare global {
    var __prisma: PrismaClient | undefined;
  }

  prisma = global.__prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

  if (!isProduction) {
    global.__prisma = prisma;
  }
}

export { prisma };
