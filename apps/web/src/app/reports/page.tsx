"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type ProfitReport = {
  totalRevenue: number;
  totalCostProfit: number;
  totalExpenses: number;
  netProfit: number;
  totalDiscount: number;
  salesCount: number;
  expensesByCategory: { category: string; amount: number }[];
  dailyTrend: { date: string; revenue: number; profit: number }[];
};

type CommissionItem = {
  id: string; fullName: string; commission: number;
  totalRevenue: number; commissionAmt: number; salesCount: number; totalDiscount: number;
  monthlyBreakdown?: { month: string; revenue: number; commission: number; count: number }[];
};
type TailorBonus = {
  id: string; fullName: string; totalBonus: number; totalMeters: number;
  completedCount: number; straightCount: number; buzmeCount: number;
  monthlyBreakdown: { month: string; bonus: number; meters: number; count: number }[];
};

type Sale = {
  id: string; saleNumber: string; total: number; debt: number; deposit: number;
  discountPct: number; discountAmt: number; subtotal: number;
  soldAt: string; note?: string;
  customer?: { name: string; phone: string };
  seller?: { fullName: string };
};

export default function ReportsPage() {
  const { user } = useAuth();
  const apiFetch = useApi();
  const isAdmin = user?.role === "ADMIN";

  const [fromDate, setFromDate] = useState(monthStartStr());
  const [toDate, setToDate] = useState(todayStr());
  const [profit, setProfit] = useState<ProfitReport | null>(null);
  const [commissions, setCommissions] = useState<CommissionItem[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [tailorBonuses, setTailorBonuses] = useState<TailorBonus[]>([]);
  const [straightBonusRate, setStraightBonusRate] = useState("0.03");
  const [buzmeBonusRate, setBuzmeBonusRate] = useState("0.06");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"summary" | "commissions" | "sales" | "tailor">("summary");

  const load = useCallback(() => {
    setLoading(true);
    const qp = `?from=${fromDate}T00:00:00&to=${toDate}T23:59:59`;

    const tasks: Promise<void>[] = [];

    if (isAdmin) {
      tasks.push(
        apiFetch<ProfitReport>(`/reports/profit${qp}`).then(setProfit).catch(() => undefined),
        apiFetch<{ items: CommissionItem[] }>(`/reports/commissions${qp}`).then(d => setCommissions(d.items)).catch(() => undefined),
        apiFetch<{ items: TailorBonus[] }>("/reports/tailor-bonuses").then(d => setTailorBonuses(d.items)).catch(() => undefined),
        apiFetch<{ key: string; value: string } | null>("/settings/tailor_straight_bonus").then(d => { if (d?.value) setStraightBonusRate(d.value); }).catch(() => undefined),
        apiFetch<{ key: string; value: string } | null>("/settings/tailor_buzme_bonus").then(d => { if (d?.value) setBuzmeBonusRate(d.value); }).catch(() => undefined)
      );
    }

    tasks.push(
      apiFetch<{ items: Sale[] }>(`/sales?page=1&limit=50&from=${fromDate}T00:00:00&to=${toDate}T23:59:59`)
        .then(d => setRecentSales(d.items)).catch(() => undefined)
    );

    Promise.all(tasks).finally(() => setLoading(false));
  }, [apiFetch, fromDate, isAdmin, toDate]);

  useEffect(() => { load(); }, [load]);

  const totalDebt = recentSales.reduce((s, x) => s + x.debt, 0);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">Hesabatlar</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Maliyyə analitikası</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label className="text-xs font-semibold">Başlanğıc</label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1 w-40" />
            </div>
            <div>
              <label className="text-xs font-semibold">Son</label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1 w-40" />
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>{loading ? "Yüklənir..." : "Hesabla"}</Button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-[var(--border)] pb-1">
          {[
            { key: "summary", label: "Maliyyə xülasəsi" },
            ...(isAdmin ? [{ key: "commissions", label: "Komissiyalar" }] : []),
            { key: "sales", label: "Satışlar" },
            ...(isAdmin ? [{ key: "tailor", label: "Dərzi bonusları" }] : [])
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-[14px] border border-b-0 transition ${tab === t.key ? "border-[var(--border)] bg-white text-[var(--primary)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--primary)]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "summary" && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Ümumi gəlir" value={`₼ ${recentSales.reduce((s, x) => s + x.total, 0).toFixed(2)}`} subtitle={`${recentSales.length} satış`} tone="primary" />
              {isAdmin && profit && (
                <>
                  <KpiCard title="Xalis mənfəət (satış)" value={`₼ ${profit.totalCostProfit.toFixed(2)}`} subtitle="Alış - satış fərqi" tone="success" />
                  <KpiCard title="Ümumi xərc" value={`₼ ${profit.totalExpenses.toFixed(2)}`} subtitle="Xərc kateqoriyaları" tone="warning" />
                  <KpiCard title="Xalis mənfəət" value={`₼ ${profit.netProfit.toFixed(2)}`} subtitle="Xərclərdən sonra" tone={profit.netProfit >= 0 ? "success" : "danger"} />
                  <KpiCard title="Ümumi endirim" value={`₼ ${(profit.totalDiscount ?? 0).toFixed(2)}`} subtitle="Verilmiş endirimlər cəmi" tone="accent" />
                </>
              )}
              <KpiCard title="Ümumi borc" value={`₼ ${totalDebt.toFixed(2)}`} subtitle="Ödənilməmiş borcllar" tone={totalDebt > 0 ? "danger" : "success"} />
            </div>

            {isAdmin && profit && (
              <div className="grid gap-6 lg:grid-cols-2 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Gəlir və Mənfəət Trendi</CardTitle>
                    <CardDescription>Seçilən aralıqda günlük satış və mənfəət</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {profit.dailyTrend && profit.dailyTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={profit.dailyTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                          <XAxis dataKey="date" tickFormatter={tick => tick.slice(5)} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={tick => `₼${tick}`} />
                          <Tooltip 
                            formatter={(value: number, name: string) => [`₼ ${value.toFixed(2)}`, name === "revenue" ? "Gəlir" : "Mənfəət"]}
                            labelFormatter={(label) => `Tarix: ${label}`}
                            contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}
                          />
                          <Legend wrapperStyle={{ fontSize: "12px" }} />
                          <Bar dataKey="revenue" name="Gəlir (Satış)" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                          <Bar dataKey="profit" name="Mənfəət" fill="var(--success)" radius={[4, 4, 0, 0]} maxBarSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">Qrafik üçün məlumat yoxdur</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Xərclərin Bölgüsü</CardTitle>
                    <CardDescription>Ümumi xərclərin kateqoriyalar üzrə faizi</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    {profit.expensesByCategory && profit.expensesByCategory.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={profit.expensesByCategory}
                            cx="50%" cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            paddingAngle={3}
                            dataKey="amount"
                            nameKey="category"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                            style={{ fontSize: "11px", fontWeight: "bold" }}
                          >
                            {profit.expensesByCategory.map((entry, index) => {
                              const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];
                              return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />;
                            })}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number) => [`₼ ${value.toFixed(2)}`, "Xərc"]}
                            contentStyle={{ borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-[var(--muted-foreground)]">Xərc yoxdur</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {tab === "commissions" && isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">İşçi komissiyaları</CardTitle>
              <CardDescription>Satış gəliri əsasında hesablanmış</CardDescription>
            </CardHeader>
            <CardContent>
              {commissions.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Məlumat yoxdur</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="pb-2 text-left font-semibold">İşçi</th>
                      <th className="pb-2 text-center font-semibold">Satış sayı</th>
                      <th className="pb-2 text-right font-semibold">Gəlir</th>
                      <th className="pb-2 text-right font-semibold">Endirim</th>
                      <th className="pb-2 text-center font-semibold">Faiz %</th>
                      <th className="pb-2 text-right font-semibold">Komissiya</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map(c => (
                      <tr key={c.id} className="border-b border-[var(--border)]/60">
                        <td className="py-3 font-medium">{c.fullName}</td>
                        <td className="py-3 text-center">{c.salesCount}</td>
                        <td className="py-3 text-right">₼ {c.totalRevenue.toFixed(2)}</td>
                        <td className="py-3 text-right text-[var(--danger)]">
                          {(c.totalDiscount ?? 0) > 0 ? `₼ ${(c.totalDiscount ?? 0).toFixed(2)}` : "—"}
                        </td>
                        <td className="py-3 text-center">%{c.commission}</td>
                        <td className="py-3 text-right font-bold text-[var(--accent)]">₼ {c.commissionAmt.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="pt-3" colSpan={3}>Cəmi</td>
                      <td className="pt-3 text-right text-[var(--danger)]">
                        ₼ {commissions.reduce((s, c) => s + (c.totalDiscount ?? 0), 0).toFixed(2)}
                      </td>
                      <td className="pt-3" />
                      <td className="pt-3 text-right text-[var(--accent)]">
                        ₼ {commissions.reduce((s, c) => s + c.commissionAmt, 0).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Aylıq Bonus Cədvəli */}
              {commissions.some(c => c.monthlyBreakdown && c.monthlyBreakdown.length > 0) && (
                <div className="mt-6">
                  <h3 className="text-base font-semibold mb-3 px-1">Aylıq Bonuslar</h3>
                  {commissions.map(c => (
                    c.monthlyBreakdown && c.monthlyBreakdown.length > 0 && (
                      <div key={c.id} className="mb-4">
                        <p className="text-sm font-medium text-[var(--accent)] mb-2 px-1">{c.fullName} ({c.commission}%)</p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-[var(--border)] bg-[var(--soft-navy)]/50">
                              <th className="px-4 py-2 text-left font-semibold">Ay</th>
                              <th className="px-4 py-2 text-right font-semibold">Satış sayı</th>
                              <th className="px-4 py-2 text-right font-semibold">Satış məbləği</th>
                              <th className="px-4 py-2 text-right font-semibold">Bonus</th>
                            </tr>
                          </thead>
                          <tbody>
                            {c.monthlyBreakdown.map(m => {
                              const monthNames: Record<string, string> = {"01":"Yanvar","02":"Fevral","03":"Mart","04":"Aprel","05":"May","06":"İyun","07":"İyul","08":"Avqust","09":"Sentyabr","10":"Oktyabr","11":"Noyabr","12":"Dekabr"};
                              const [y, mm] = m.month.split("-");
                              return (
                                <tr key={m.month} className="border-b border-[var(--border)]/60">
                                  <td className="px-4 py-2">{monthNames[mm] || mm} {y}</td>
                                  <td className="px-4 py-2 text-right">{m.count}</td>
                                  <td className="px-4 py-2 text-right">₼ {m.revenue.toFixed(2)}</td>
                                  <td className="px-4 py-2 text-right text-[var(--accent)] font-semibold">₼ {m.commission.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "sales" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Satış siyahısı</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--soft-navy)]/50">
                      <th className="px-4 py-3 text-left font-semibold">Çek #</th>
                      <th className="px-4 py-3 text-left font-semibold">Müştəri</th>
                      {isAdmin && <th className="px-4 py-3 text-left font-semibold">Satıcı</th>}
                      <th className="px-4 py-3 text-right font-semibold">Məbləğ</th>
                      <th className="px-4 py-3 text-right font-semibold">Endirim</th>
                      <th className="px-4 py-3 text-right font-semibold">Borc</th>
                      <th className="px-4 py-3 text-right font-semibold">Tarix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSales.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--muted-foreground)]">Satış tapılmadı</td></tr>
                    ) : recentSales.map(s => {
                      const totalDiscount = (s.subtotal - s.total) || ((s.subtotal * (s.discountPct ?? 0)) / 100 + (s.discountAmt ?? 0));
                      return (
                      <tr key={s.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--soft-navy)]/20">
                        <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">#{s.saleNumber.slice(-8)}</td>
                        <td className="px-4 py-3">{s.customer ? <span>{s.customer.name}<br/><span className="text-xs text-[var(--muted-foreground)]">{s.customer.phone}</span></span> : <span className="text-[var(--muted-foreground)]">—</span>}</td>
                        {isAdmin && <td className="px-4 py-3">{s.seller?.fullName ?? "—"}</td>}
                        <td className="px-4 py-3 text-right font-semibold">₼ {s.total.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right">
                          {totalDiscount > 0
                            ? <span className="text-[var(--danger)] font-medium">-₼ {totalDiscount.toFixed(2)}{s.discountPct > 0 ? ` (%${s.discountPct})` : ""}</span>
                            : <span className="text-[var(--muted-foreground)]">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {s.debt > 0
                            ? <Badge variant="destructive" className="text-xs">₼ {s.debt.toFixed(2)}</Badge>
                            : <Badge variant="success" className="text-xs">Ödənilib</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[var(--muted-foreground)]">
                          {new Date(s.soldAt).toLocaleDateString("az-AZ")}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "tailor" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dərzi Bonusları</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-[var(--muted-foreground)] mb-4">Düz tikiş: {straightBonusRate} AZN/metr | Büzmə: {buzmeBonusRate} AZN/metr</p>
              {tailorBonuses.length === 0 ? (
                <p className="text-center text-[var(--muted-foreground)] py-8">Dərzi bonusu tapılmadı</p>
              ) : tailorBonuses.map(t => (
                <div key={t.id} className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-[var(--accent)]">{t.fullName}</h3>
                    <div className="flex gap-4 text-sm">
                      <span>Tamamlanan: <strong>{t.completedCount}</strong></span>
                      <span>Düz: <strong>{t.straightCount}</strong> | Büzmə: <strong>{t.buzmeCount}</strong></span>
                      <span>{t.totalMeters.toFixed(1)} metr</span>
                      <span className="text-[var(--accent)] font-bold">Ümumi: ₼ {t.totalBonus.toFixed(2)}</span>
                    </div>
                  </div>
                  {t.monthlyBreakdown.length > 0 && (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--soft-navy)]/50">
                          <th className="px-4 py-2 text-left font-semibold">Ay</th>
                          <th className="px-4 py-2 text-right font-semibold">Sifariş</th>
                          <th className="px-4 py-2 text-right font-semibold">Metr</th>
                          <th className="px-4 py-2 text-right font-semibold">Bonus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.monthlyBreakdown.map(m => {
                          const monthNames: Record<string, string> = {"01":"Yanvar","02":"Fevral","03":"Mart","04":"Aprel","05":"May","06":"İyun","07":"İyul","08":"Avqust","09":"Sentyabr","10":"Oktyabr","11":"Noyabr","12":"Dekabr"};
                          const [y, mm] = m.month.split("-");
                          return (
                            <tr key={m.month} className="border-b border-[var(--border)]/60">
                              <td className="px-4 py-2">{monthNames[mm] || mm} {y}</td>
                              <td className="px-4 py-2 text-right">{m.count}</td>
                              <td className="px-4 py-2 text-right">{m.meters.toFixed(1)}</td>
                              <td className="px-4 py-2 text-right text-[var(--accent)] font-semibold">₼ {m.bonus.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}

function KpiCard({ title, value, subtitle, tone }: { title: string; value: string; subtitle: string; tone: string }) {
  const toneClass = ({
    primary: "text-[var(--primary)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    accent: "text-[var(--accent)]"
  } as Record<string, string>)[tone] ?? "text-[var(--foreground)]";

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white/80 p-5">
      <p className="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">{title}</p>
      <p className={`display-font mt-2 text-3xl ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">{subtitle}</p>
    </div>
  );
}

function monthStartStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
