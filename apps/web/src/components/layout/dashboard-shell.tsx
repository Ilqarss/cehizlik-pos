"use client";

import {
  ChartNoAxesColumn, LayoutDashboard, LogOut, Menu, Package2,
  Scissors, Settings, ShoppingCart, Users, Wallet, UserCog, X, Printer
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { hasPermission, ROLE_LABELS, type Permission } from "@cehizlik/types";
import { useAuth } from "../../lib/auth/auth-context";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  permission?: Permission;
};

const navigation: NavItem[] = [
  {
    href: "/dashboard",
    label: "İdarə paneli",
    description: "Ümumi vəziyyət",
    icon: <LayoutDashboard className="h-4 w-4" />,
    permission: "dashboard:view"
  },
  {
    href: "/sales",
    label: "Satış",
    description: "Pərdə & jalüz kalkulyatoru",
    icon: <ShoppingCart className="h-4 w-4" />,
    permission: "sales:create"
  },
  {
    href: "/inventory",
    label: "Anbar",
    description: "Məhsullar, import, stok",
    icon: <Package2 className="h-4 w-4" />,
    permission: "inventory:read"
  },
  {
    href: "/customers",
    label: "Müştərilər",
    description: "CRM, ölçülər, borc",
    icon: <Users className="h-4 w-4" />,
    permission: "customers:read"
  },
  {
    href: "/tailor",
    label: "Dərzi paneli",
    description: "Sifariş statusları",
    icon: <Scissors className="h-4 w-4" />,
    permission: "tailor:read"
  },
  {
    href: "/expenses",
    label: "Xərclər",
    description: "Gündəlik xərc qeydi",
    icon: <Wallet className="h-4 w-4" />,
    permission: "expenses:write"
  },
  {
    href: "/reports",
    label: "Hesabatlar",
    description: "Mənfəət, komissiya",
    icon: <ChartNoAxesColumn className="h-4 w-4" />,
    permission: "reports:read"
  },
  {
    href: "/daily-report",
    label: "Günlük Açot",
    description: "Kassa və Z-Report",
    icon: <Printer className="h-4 w-4" />,
    permission: "reports:read"
  },
  {
    href: "/users",
    label: "İstifadəçilər",
    description: "Rollər və icazələr",
    icon: <UserCog className="h-4 w-4" />,
    permission: "users:read"
  },
  {
    href: "/settings",
    label: "Ayarlar",
    description: "Sistem parametrləri",
    icon: <Settings className="h-4 w-4" />,
    permission: "settings:read"
  }
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, router, user]);

  const visibleLinks = useMemo(() => {
    return navigation.filter(item => !item.permission || (user && hasPermission(user.role, item.permission)));
  }, [user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-[32px] border border-[var(--border)] px-8 py-6 text-sm text-[var(--muted-foreground)] shadow-xl">
          İL & AY yüklənir...
        </div>
      </div>
    );
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[270px] border-r border-white/10 bg-[var(--navy-950)] px-4 py-4 text-white shadow-2xl transition-transform lg:static lg:w-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between lg:hidden">
          <StoreMark />
          <button className="rounded-2xl bg-white/10 p-2 text-white" onClick={() => setMobileOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex h-full flex-col" style={{ marginTop: mobileOpen ? "1rem" : undefined }}>
          <div className="hidden lg:block">
            <StoreMark />
          </div>

          {/* Profil kartı */}
          <div className="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--navy-950)] font-bold text-sm">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.fullName}</p>
                <p className="truncate text-xs text-white/60">{user.phone}</p>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Badge className="bg-white/10 text-white text-xs">
                {ROLE_LABELS[user.role]}
              </Badge>
              {user.commission > 0 && (
                <Badge className="bg-[var(--accent)]/20 text-[var(--accent)] text-xs">
                  %{user.commission} komissiya
                </Badge>
              )}
            </div>
          </div>

          {/* Naviqasiya */}
          <nav className="mt-4 flex-1 space-y-1 overflow-y-auto">
            {visibleLinks.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-[20px] border px-3 py-2.5 transition",
                    active
                      ? "border-[var(--accent)]/40 bg-white/12 text-white"
                      : "border-transparent bg-white/4 text-white/70 hover:border-white/10 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
                    active ? "bg-[var(--accent)] text-[var(--navy-950)]" : "bg-white/8 text-white/70 group-hover:bg-white/12"
                  )}>
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-sm font-semibold leading-tight">{item.label}</div>
                    <div className="text-xs text-white/50">{item.description}</div>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Alt – çıxış */}
          <div className="mt-2 pt-2 border-t border-white/10">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 rounded-[18px] text-white/70 hover:bg-white/8 hover:text-white"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4" />
              Sistemdən çıx
            </Button>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-[rgba(8,14,29,0.5)] lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Əsas məzmun */}
      <div className="relative min-w-0">
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(248,245,238,0.88)] backdrop-blur">
          <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white/80 lg:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5 text-[var(--foreground)]" />
              </button>
              <div>
                <p className="display-font text-2xl leading-none text-[var(--primary)]">İL & AY</p>
                <p className="text-xs text-[var(--muted-foreground)]">Pərdə & Jalüz sistemi</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="accent" className="hidden sm:flex">{ROLE_LABELS[user.role]}</Badge>
              <div className="hidden rounded-full border border-[var(--border)] bg-white/80 px-3 py-1.5 text-sm text-[var(--muted-foreground)] sm:block">
                {user.fullName}
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function StoreMark() {
  return (
    <div className="px-1">
      <p className="display-font text-3xl leading-none text-white">İL & AY</p>
      <p className="mt-1 text-xs text-white/55">Pərdə & Jalüz mağazası</p>
    </div>
  );
}
