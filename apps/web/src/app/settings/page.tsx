"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const apiFetch = useApi();
  const router = useRouter();

  const [maxDiscountPct, setMaxDiscountPct] = useState("15");
  const [tailorStraightBonus, setTailorStraightBonus] = useState("0.03");
  const [tailorBuzmeBonus, setTailorBuzmeBonus] = useState("0.06");
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "ADMIN") router.replace("/dashboard");
  }, [authLoading, router, user]);

  const load = useCallback(() => {
    Promise.all([
      apiFetch<{ key: string; value: string } | null>("/settings/max_discount_pct").catch(() => null),
      apiFetch<{ key: string; value: string } | null>("/settings/tailor_straight_bonus").catch(() => null),
      apiFetch<{ key: string; value: string } | null>("/settings/tailor_buzme_bonus").catch(() => null)
    ]).then(([d1, d2, d3]) => {
      if (d1?.value) setMaxDiscountPct(d1.value);
      if (d2?.value) setTailorStraightBonus(d2.value);
      if (d3?.value) setTailorBuzmeBonus(d3.value);
    });
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function saveSettings() {
    const val = Number(maxDiscountPct);
    const straightVal = Number(tailorStraightBonus);
    const buzmeVal = Number(tailorBuzmeBonus);

    if (isNaN(val) || val < 0 || val > 100) {
      alert("Endirim faizi 0-100 arasında olmalıdır");
      return;
    }
    if (isNaN(straightVal) || straightVal < 0 || isNaN(buzmeVal) || buzmeVal < 0) {
      alert("Bonus məbləğləri düzgün deyil");
      return;
    }

    setSaving(true);
    try {
      await Promise.all([
        apiFetch("/settings/max_discount_pct", { method: "PUT", body: JSON.stringify({ value: String(val) }) }),
        apiFetch("/settings/tailor_straight_bonus", { method: "PUT", body: JSON.stringify({ value: String(straightVal) }) }),
        apiFetch("/settings/tailor_buzme_bonus", { method: "PUT", body: JSON.stringify({ value: String(buzmeVal) }) })
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta baş verdi");
    } finally {
      setSaving(false);
    }
  }

  if (!user || user.role !== "ADMIN") return null;

  return (
    <DashboardShell>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="display-font text-3xl text-[var(--primary)]">Ayarlar</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Sistem parametrləri – yalnız Admin</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endirim məhdudiyyəti</CardTitle>
            <CardDescription>
              Satıcının bir satışda verə biləcəyi maksimum endirim faizini təyin edin.
              Bu limit aşıldıqda satış qəbul edilməyəcək.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-semibold">Maksimum endirim faizi (%)</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-2">
                Məsələn: 15 daxil etsəniz, satıcı 15%-dən çox endirim edə bilməz. 0 daxil etsəniz limit yoxdur.
              </p>
              <div className="flex gap-3 items-center">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={maxDiscountPct}
                  onChange={e => setMaxDiscountPct(e.target.value)}
                  className="w-32"
                  placeholder="15"
                />
                <span className="text-sm text-[var(--muted-foreground)]">%</span>
              </div>
            </div>
            
            <div className="pt-4 border-t border-[var(--border)]">
              <label className="text-sm font-semibold">Dərzi bonusları (AZN / metr)</label>
              <p className="text-xs text-[var(--muted-foreground)] mb-4">
                Dərzi sifarişi yaranarkən hər metrə düşən bonus məbləğini təyin edin.
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-sm">
                <div>
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Düz tikiş</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tailorStraightBonus}
                    onChange={e => setTailorStraightBonus(e.target.value)}
                    className="mt-1"
                    placeholder="0.03"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--muted-foreground)]">Büzmə tikiş</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tailorBuzmeBonus}
                    onChange={e => setTailorBuzmeBonus(e.target.value)}
                    className="mt-1"
                    placeholder="0.06"
                  />
                </div>
              </div>
            </div>

            <Button onClick={saveSettings} disabled={saving}>
              {saving ? "Saxlanır..." : saved ? "Saxlandı!" : "Saxla"}
            </Button>

            {saved && (
              <p className="text-sm text-[var(--success)]">
                Ayar ugurla yenilendi. Yeni satirlar bu limitden yuxari endirim qebul etmeyecek.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
