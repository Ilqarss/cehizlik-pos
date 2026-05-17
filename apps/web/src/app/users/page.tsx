"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";
import { ROLE_LABELS, type UserRole } from "@cehizlik/types";

type User = {
  id: string; fullName: string; username: string; phone: string;
  role: UserRole; commission: number; isActive: boolean;
  lastLoginAt?: string; createdAt: string;
};

export default function UsersPage() {
  const { user, loading: authLoading } = useAuth();
  const apiFetch = useApi();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Yeni istifadəçi formu
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("SELLER");
  const [commission, setCommission] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user && user.role !== "ADMIN") router.replace("/dashboard");
  }, [authLoading, router, user]);

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<User[]>("/users")
      .then(setUsers)
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function createUser() {
    if (!fullName || !username || !phone || !password) { alert("Bütün sahələr tələb olunur"); return; }
    setSubmitting(true);
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({ fullName, username, phone, password, role, commission: Number(commission) })
      });
      setShowForm(false);
      setFullName(""); setUsername(""); setPhone(""); setPassword(""); setCommission("0");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(u: User) {
    try {
      await apiFetch(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !u.isActive })
      });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta");
    }
  }

  if (!user || user.role !== "ADMIN") return null;

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">İstifadəçilər</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Rol idarəsi – yalnız Admin</p>
          </div>
          <Button onClick={() => {
            if (!showForm) {
              // Formu acarken mutleq bosalt
              setFullName(""); setUsername(""); setPhone(""); setPassword(""); setCommission("0"); setRole("SELLER");
            }
            setShowForm(prev => !prev);
          }} size="sm">+ Yeni istifadəçi</Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Yeni istifadəçi yarat</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Input placeholder="Ad Soyad" value={fullName} onChange={e => setFullName(e.target.value)} />
              <Input placeholder="İstifadəçi adı (login)" value={username} onChange={e => setUsername(e.target.value)} />
              <Input placeholder="+994501234567" value={phone} onChange={e => setPhone(e.target.value)} />
              <Input type="password" placeholder="Şifrə (min 6)" value={password} onChange={e => setPassword(e.target.value)} />
              <div>
                <label className="text-xs font-semibold">Rol</label>
                <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                  className="mt-1 h-10 w-full rounded-2xl border border-[var(--border)] bg-white px-3 text-sm">
                  {(["ADMIN", "SELLER", "TAILOR", "USTA"] as UserRole[]).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold">Komissiya faizi (%)</label>
                <Input type="number" min="0" max="100" value={commission} onChange={e => setCommission(e.target.value)} className="mt-1" />
              </div>
              <div className="col-span-2 flex gap-2">
                <Button className="flex-1" onClick={createUser} disabled={submitting}>
                  {submitting ? "Yaradılır..." : "Yarat"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Ləğv et</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--soft-navy)]/50">
                    <th className="px-4 py-3 text-left font-semibold">Ad Soyad</th>
                    <th className="px-4 py-3 text-left font-semibold">İstifadəçi adı</th>
                    <th className="px-4 py-3 text-left font-semibold">Telefon</th>
                    <th className="px-4 py-3 text-center font-semibold">Rol</th>
                    <th className="px-4 py-3 text-center font-semibold">Komissiya</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-center font-semibold">Son giriş</th>
                    <th className="px-4 py-3 text-center font-semibold">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--muted-foreground)]">Yüklənir...</td></tr>
                  ) : users.map(u => (
                    <tr key={u.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--soft-navy)]/20">
                      <td className="px-4 py-3 font-medium">{u.fullName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                      <td className="px-4 py-3">{u.phone}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={u.role === "ADMIN" ? "accent" : u.role === "SELLER" ? "default" : "secondary"} className="text-xs">
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">{u.commission > 0 ? `%${u.commission}` : "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={u.isActive ? "success" : "secondary"} className="text-xs">
                          {u.isActive ? "Aktiv" : "Deaktiv"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-[var(--muted-foreground)]">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("az-AZ") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {u.id !== user.id && (
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => toggleActive(u)}
                              className={`rounded-xl border px-2 py-1 text-xs transition ${u.isActive ? "border-[var(--danger)]/40 text-[var(--danger)] hover:bg-[var(--danger)]/5" : "border-[var(--success)]/40 text-[var(--success)] hover:bg-[var(--success)]/5"}`}
                            >
                              {u.isActive ? "Deaktiv et" : "Aktiv et"}
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm(`"${u.fullName}" istifadəçisini silmək istəyirsiniz?`)) return;
                                try {
                                  await apiFetch(`/users/${u.id}`, { method: "DELETE" });
                                  load();
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : "Xəta");
                                }
                              }}
                              className="rounded-xl border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition"
                            >
                              Sil
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Rol açıqlamaları */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { role: "ADMIN", label: "Admin (Sahibkar)", desc: "Tam giriş. Alış qiyməti, xalis mənfəət, komissiyalar." },
            { role: "SELLER", label: "Satıcı", desc: "Satış, anbar, müştəri. Alış qiymətini görmür." },
            { role: "TAILOR", label: "Dərzi", desc: "Yalnız dərzi sifarişlərini görür və status yeniləyir." },
            { role: "USTA", label: "Usta", desc: "Quraşdırma xidmətləri üçün seçilən usta." }
          ].map(item => (
            <div key={item.role} className="rounded-[22px] border border-[var(--border)] bg-white/60 p-4">
              <p className="font-semibold">{item.label}</p>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
