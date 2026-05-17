// ─── Rollər ───────────────────────────────────────────────────────────────────
export type UserRole = "ADMIN" | "SELLER" | "TAILOR" | "USTA";

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin (Sahibkar)",
  SELLER: "Satıcı",
  TAILOR: "Dərzi",
  USTA: "Usta"
};

// ─── İcazələr ─────────────────────────────────────────────────────────────────
export type Permission =
  // İdarə paneli
  | "dashboard:view"
  | "dashboard:profit"      // Xalis mənfəət – YALNIZ ADMIN
  // Anbar
  | "inventory:read"
  | "inventory:write"
  | "inventory:import"      // Excel/CSV import
  | "inventory:cost"        // Alış qiymətini görür – YALNIZ ADMIN
  // Satış
  | "sales:create"
  | "sales:read"
  | "sales:discount"
  | "sales:profit"          // Mənfəəti görür – YALNIZ ADMIN
  // Müştəri
  | "customers:read"
  | "customers:write"
  // Dərzi
  | "tailor:read"
  | "tailor:write"
  | "tailor:assign"         // Sifariş atamaq – YALNIZ ADMIN
  // Xərclər
  | "expenses:read"
  | "expenses:write"
  | "expenses:read_all"     // Bütün xərcləri görür – YALNIZ ADMIN
  // İstifadəçilər
  | "users:read"
  | "users:write"
  // Ayarlar
  | "settings:read"
  | "settings:write"
  // Hesabatlar
  | "reports:read"
  | "reports:profit"        // Mənfəət hesabatı – YALNIZ ADMIN
  | "reports:commissions"   // Komissiyalar – YALNIZ ADMIN
  // Çek
  | "receipt:print";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    "dashboard:view",
    "dashboard:profit",
    "inventory:read",
    "inventory:write",
    "inventory:import",
    "inventory:cost",
    "sales:create",
    "sales:read",
    "sales:discount",
    "sales:profit",
    "customers:read",
    "customers:write",
    "tailor:read",
    "tailor:write",
    "tailor:assign",
    "expenses:read",
    "expenses:write",
    "expenses:read_all",
    "users:read",
    "users:write",
    "settings:read",
    "settings:write",
    "reports:read",
    "reports:profit",
    "reports:commissions",
    "receipt:print"
  ],
  SELLER: [
    "dashboard:view",
    "inventory:read",
    "inventory:import",
    // inventory:cost YOX
    "sales:create",
    "sales:read",
    "sales:discount",
    "sales:profit",
    "customers:read",
    "customers:write",
    "tailor:read",
    "tailor:write",         // Status yenilə (öz satışından yaranan sifarişlər)
    "expenses:write",       // Öz xərclərini yazır
    "expenses:read",        // Yalnız öz xərclərini görür
    "reports:read",
    "reports:profit",
    "reports:commissions",
    "receipt:print"
  ],
  TAILOR: [
    // Yalnız dərzi sifarişlərini görür və status yeniləyir
    "tailor:read",
    "tailor:write"
  ],
  USTA: [
    // Usta üçün paneli
    "dashboard:view",
    "reports:read"
  ]
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// ─── Məhsul tipləri ───────────────────────────────────────────────────────────
export type ProductType = "CURTAIN" | "JALOUSIE" | "CORNICE" | "OTHER";

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  CURTAIN: "Pərdə",
  JALOUSIE: "Jalüz",
  CORNICE: "Karniz",
  OTHER: "Digər"
};

// ─── Quraşdırma (Installation) ────────────────────────────────────────────────
export type InstallationType = "STRAIGHT_CORNICE" | "CURVED_CORNICE" | "JALOUSIE";

export const INSTALLATION_TYPE_LABELS: Record<InstallationType, string> = {
  STRAIGHT_CORNICE: "Düz Karniz",
  CURVED_CORNICE: "Əyri Karniz",
  JALOUSIE: "Jalüz"
};

// ─── Dərzi statusu ────────────────────────────────────────────────────────────
export type TailorStatus = "WAITING" | "IN_PROGRESS" | "READY";

export const TAILOR_STATUS_LABELS: Record<TailorStatus, string> = {
  WAITING: "Gözləyir",
  IN_PROGRESS: "Tikilir",
  READY: "Hazırdır"
};

// ─── Ödəniş ───────────────────────────────────────────────────────────────────
export type PaymentType = "CASH" | "CARD" | "TRANSFER";

export const PAYMENT_LABELS: Record<PaymentType, string> = {
  CASH: "Nağd",
  CARD: "Kart",
  TRANSFER: "Bank köçürməsi"
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export type AuthUser = {
  id: string;
  fullName: string;
  username: string;
  phone: string;
  role: UserRole;
  commission: number;
  isActive: boolean;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

// ─── API cavab formatı ────────────────────────────────────────────────────────
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// ─── Hesablamalar ─────────────────────────────────────────────────────────────

/** Pərdə: metr * büzmə əmsalı * qiymet */
export function calcCurtainTotal(meters: number, buzmeFactor: number, pricePerMeter: number): number {
  return meters * buzmeFactor * pricePerMeter;
}

/** Jalüz: en * hünd, minimum 1 m² */
export function calcJalouieArea(widthM: number, heightM: number): number {
  return Math.max(widthM * heightM, 1);
}

/** Endirim tətbiqi */
export function applyDiscount(
  subtotal: number,
  discountPct: number,
  discountAmt: number
): number {
  const afterPct = subtotal - (subtotal * discountPct) / 100;
  return Math.max(afterPct - discountAmt, 0);
}

// ─── Büzmə əmsalı seçimləri ───────────────────────────────────────────────────
export const BUZME_FACTORS = [1, 1.5, 2, 2.5, 3] as const;
export type BuzmeFactor = (typeof BUZME_FACTORS)[number];

// ─── Xərc kateqoriyaları ──────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  "Parasok",
  "Kommunal",
  "Yemək",
  "Nəqliyyat",
  "Kirayə",
  "Digər"
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ─── Çek eni ──────────────────────────────────────────────────────────────────
export type ReceiptWidth = "58mm" | "80mm";
