"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@cehizlik/types";

type Expense = {
  id: string; category: string; amount: number; description?: string;
  expenseDate: string; createdAt: string;
  user?: { id: string; fullName: string };
};

export default function ExpensesPage() {
  const { user } = useAuth();
  const apiFetch = useApi();
  const isAdmin = user?.role === "ADMIN";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());

  // Yeni xərc formu
  const [category, setCategory] = useState<ExpenseCategory>("Parasok");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (fromDate) params.set("from", fromDate + "T00:00:00");
    if (toDate) params.set("to", toDate + "T23:59:59");
    apiFetch<{ items: Expense[]; total: number }>(`/expenses?${params}`)
      .then(d => { setExpenses(d.items); setTotal(d.total); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [apiFetch, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  async function addExpense() {
    if (!amount || Number(amount) <= 0) { alert("Məbləğ tələb olunur"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/expenses", {
        method: "POST",
        body: JSON.stringify({ category, amount: Number(amount), description: description || undefined, expenseDate: expenseDate + "T12:00:00" })
      });
      setAmount(""); setDescription("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Silinsin?")) return;
    try {
      await apiFetch(`/expenses/${id}`, { method: "DELETE" });
      setExpenses(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta");
    }
  }

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <DashboardShell>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        {/* Sol: Əlavə et */}
        <div className="space-y-4">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">Xərclər</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Gündəlik xərc qeydi</p>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Yeni xərc əlavə et</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Kateqoriya</label>
                <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)}
                  className="mt-1 h-10 w-full rounded-2xl border border-[var(--border)] bg-white px-3 text-sm">
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Məbləğ (₼)</label>
                <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold">İzah (ixtiyari)</label>
                <Input placeholder="Qısa izah..." value={description} onChange={e => setDescription(e.target.value)} className="mt-1 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold">Tarix</label>
                <Input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="mt-1" />
              </div>
              <Button className="w-full" onClick={addExpense} disabled={submitting}>
                {submitting ? "Əlavə edilir..." : "Xərc əlavə et"}
              </Button>
            </CardContent>
          </Card>

          {/* Kateqoriya xülasəsi */}
          {Object.keys(byCategory).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Kateqoriya üzrə</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <div key={cat} className="flex items-center justify-between rounded-[16px] border border-[var(--border)] px-3 py-2">
                    <span className="text-sm">{cat}</span>
                    <span className="font-semibold text-sm">₼ {amt.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-[16px] bg-[var(--primary)]/8 px-3 py-2">
                  <span className="font-bold text-sm">Cəmi</span>
                  <span className="font-bold text-sm text-[var(--primary)]">₼ {totalAmount.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sağ: Siyahı */}
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold">Başlanğıc tarix</label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="mt-1" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold">Son tarix</label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="mt-1" />
            </div>
            <Button variant="outline" onClick={load} className="shrink-0">Yenilə</Button>
          </div>

          {/* Cəm */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[22px] border border-[var(--border)] bg-white/70 p-4 text-center">
              <p className="text-xs text-[var(--muted-foreground)]">Xərc sayı</p>
              <p className="display-font mt-1 text-3xl text-[var(--primary)]">{total}</p>
            </div>
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--warning-soft)] p-4 text-center">
              <p className="text-xs text-[var(--muted-foreground)]">Ümumi</p>
              <p className="display-font mt-1 text-3xl text-[var(--warning)]">₼ {totalAmount.toFixed(2)}</p>
            </div>
          </div>

          {/* Siyahı */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <p className="p-6 text-center text-sm text-[var(--muted-foreground)]">Yüklənir...</p>
              ) : expenses.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--muted-foreground)]">Xərc tapılmadı</p>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {expenses.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--soft-navy)]/20">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{e.category}</Badge>
                          {isAdmin && e.user && (
                            <span className="text-xs text-[var(--muted-foreground)]">{e.user.fullName}</span>
                          )}
                        </div>
                        {e.description && <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{e.description}</p>}
                        <p className="text-xs text-[var(--muted-foreground)]">{new Date(e.expenseDate).toLocaleDateString("az-AZ")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">₼ {e.amount.toFixed(2)}</span>
                        <button onClick={() => deleteExpense(e.id)}
                          className="rounded-xl border border-[var(--border)] px-2 py-1 text-xs text-[var(--danger)] hover:bg-[var(--danger)]/5 transition">
                          Sil
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
