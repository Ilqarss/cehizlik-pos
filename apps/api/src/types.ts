// API daxili tiplər - @cehizlik/types əvəzinə
export type UserRole = "ADMIN" | "SELLER" | "TAILOR";

export type Permission =
  | "dashboard:view" | "dashboard:profit"
  | "inventory:read" | "inventory:write" | "inventory:import" | "inventory:cost"
  | "sales:create" | "sales:read" | "sales:discount" | "sales:profit"
  | "customers:read" | "customers:write"
  | "tailor:read" | "tailor:write" | "tailor:assign"
  | "expenses:read" | "expenses:write" | "expenses:read_all"
  | "users:read" | "users:write"
  | "settings:read" | "settings:write"
  | "reports:read" | "reports:profit" | "reports:commissions"
  | "receipt:print";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    "dashboard:view", "dashboard:profit",
    "inventory:read", "inventory:write", "inventory:import", "inventory:cost",
    "sales:create", "sales:read", "sales:discount", "sales:profit",
    "customers:read", "customers:write",
    "tailor:read", "tailor:write", "tailor:assign",
    "expenses:read", "expenses:write", "expenses:read_all",
    "users:read", "users:write",
    "settings:read", "settings:write",
    "reports:read", "reports:profit", "reports:commissions",
    "receipt:print"
  ],
  SELLER: [
    "dashboard:view",
    "inventory:read", "inventory:import",
    "sales:create", "sales:read", "sales:discount",
    "customers:read", "customers:write",
    "tailor:read", "tailor:write",
    "expenses:write", "expenses:read",
    "reports:read",
    "receipt:print"
  ],
  TAILOR: ["tailor:read", "tailor:write"]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export type ProductType = "CURTAIN" | "JALOUSIE" | "OTHER";
export type TailorStatus = "WAITING" | "IN_PROGRESS" | "READY";
export type PaymentType = "CASH" | "CARD" | "TRANSFER";
export type BuzmeFactor = 1 | 1.5 | 2 | 2.5 | 3;
export type ExpenseCategory = "Parasok" | "Kommunal" | "Yemek" | "Neqliyyat" | "Kiraye" | "Diger";
export type ReceiptWidth = "58mm" | "80mm";

export const BUZME_FACTORS: BuzmeFactor[] = [1, 1.5, 2, 2.5, 3];
export const EXPENSE_CATEGORIES: ExpenseCategory[] = ["Parasok", "Kommunal", "Yemek", "Neqliyyat", "Kiraye", "Diger"];

export function calcCurtainTotal(meters: number, buzmeFactor: number, pricePerMeter: number): number {
  return meters * buzmeFactor * pricePerMeter;
}

export function calcJalouieArea(widthM: number, heightM: number): number {
  return Math.max(widthM * heightM, 1);
}

export function applyDiscount(subtotal: number, discountPct: number, discountAmt: number): number {
  const afterPct = subtotal - (subtotal * discountPct) / 100;
  return Math.max(afterPct - discountAmt, 0);
}
