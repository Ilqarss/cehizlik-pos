"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";
import { PRODUCT_TYPE_LABELS } from "@cehizlik/types";

type Product = {
  id: string;
  code: string;
  nameAz: string;
  productType: "CURTAIN" | "JALOUSIE" | "CORNICE" | "OTHER";
  unit: string;
  salePrice: number;
  costPrice?: number;
  marginPct?: number;
  stock: number;
  minStock: number;
  isActive: boolean;
};

type ImportResult = { created: number; updated: number; errors: number; errorList: string[] };

export default function InventoryPage() {
  const { user } = useAuth();
  const apiFetch = useApi();
  const isAdmin = user?.role === "ADMIN";

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState({ code: "", nameAz: "", productType: "OTHER", unit: "metr", costPrice: "", marginPct: "", salePrice: "", stock: "", minStock: "" });
  const [page, setPage] = useState(1);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const LIMIT = 50;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (search) params.set("q", search);
    if (typeFilter) params.set("type", typeFilter);

    apiFetch<{ items: Product[]; total: number }>(`/inventory?${params}`)
      .then(d => { setProducts(d.items); setTotal(d.total); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [apiFetch, page, search, typeFilter]);

  useEffect(() => { load(); }, [load]);

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      const result = await apiFetch<ImportResult>("/inventory/import", {
        method: "POST",
        body: JSON.stringify({ rows })
      });
      setImportResult(result);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import xətası");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function parseCSV(text: string): Array<Record<string, string | number>> {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];

    const rawHeaders = lines[0].split(/[,;\t]/).map(h => h.trim());
    const headers = rawHeaders.map(h => {
      const lower = h.toLowerCase();
      if (lower.includes("kodu") || lower.includes("kod")) return "code";
      if (lower.includes("ad")) return "nameAz";
      if (lower.includes("ali")) return "costPrice";
      if (lower.includes("faiz")) return "marginPct";
      if (lower.includes("sat")) return "salePrice";
      if (lower.includes("qal")) return "stock";
      if (lower.includes("vahid") || lower.includes("unit")) return "unit";
      if (lower.includes("tip") || lower.includes("nov")) return "productType";
      return lower;
    });

    return lines.slice(1).filter(l => l.trim()).map(line => {
      const vals = line.split(/[,;\t]/).map(v => v.trim().replace(/^["']|["']$/g, ""));
      const row: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        const v = vals[i] ?? "";
        if (["costPrice", "marginPct", "salePrice", "stock", "minStock"].includes(h)) {
          row[h] = parseFloat(v.replace(",", ".")) || 0;
        } else {
          row[h] = v;
        }
      });
      if (!row.productType) row.productType = "OTHER";
      const pt = String(row.productType).toUpperCase();
      if (pt.includes("PERD") || pt.includes("CURTAIN")) row.productType = "CURTAIN";
      else if (pt.includes("JAL")) row.productType = "JALOUSIE";
      else if (pt.includes("KARN") || pt.includes("CORN")) row.productType = "CORNICE";
      else row.productType = "OTHER";
      return row;
    }).filter(r => r.code && r.nameAz && r.salePrice);
  }

  async function handleAdjust() {
    if (!adjustProduct || !adjustDelta) return;
    try {
      await apiFetch("/inventory/adjust", {
        method: "POST",
        body: JSON.stringify({ productId: adjustProduct.id, delta: Number(adjustDelta), reason: adjustReason })
      });
      setAdjustProduct(null);
      setAdjustDelta("");
      setAdjustReason("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta");
    }
  }

  function printLabel(product: Product) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiket</title>
    <style>body{font-family:'Segoe UI',Arial,sans-serif;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;}
    .label{width:58mm;border:2px solid #10213f;border-radius:4px;padding:5px 6px;text-align:center;}
    .shop{font-size:8pt;font-weight:bold;color:#10213f;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px;border-bottom:1px solid #10213f;padding-bottom:3px;}
    .subtitle{font-size:5.5pt;color:#666;margin-bottom:3px;}
    .name{font-size:8.5pt;font-weight:bold;margin:3px 0 1px;}
    .code{font-size:6.5pt;color:#555;margin-bottom:3px;}
    .price{font-size:16pt;font-weight:900;color:#10213f;margin:2px 0;}
    .unit{font-size:6.5pt;color:#777;background:#f0f0f0;display:inline-block;padding:1px 6px;border-radius:3px;}
    @media print{body{margin:0;}@page{size:58mm 40mm;margin:0;}}</style></head>
    <body><div class="label">
    <div class="shop">İL & AY</div>
    <div class="subtitle">Pərdə & Jalüz</div>
    <div class="name">${product.nameAz}</div>
    <div class="code">${product.code}</div>
    <div class="price">₼ ${product.salePrice.toFixed(2)}</div>
    <div class="unit">${product.unit}</div>
    </div>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500);}<\/script></body></html>`;
    const win = window.open("", "_blank", "width=300,height=200");
    win?.document.write(html);
    win?.document.close();
  }

  const lowStock = products.filter(p => p.stock <= p.minStock);
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">Anbar</h1>
            <p className="text-sm text-[var(--muted-foreground)]">{total} məhsul · {lowStock.length} aşağı stok</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowAddForm(!showAddForm); setNewProduct({ code: "", nameAz: "", productType: "OTHER", unit: "metr", costPrice: "", marginPct: "", salePrice: "", stock: "", minStock: "" }); }} className="text-sm">
              + Yeni məhsul
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileImport} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="text-sm">
              {importing ? "İdxal edilir..." : "CSV/Excel İdxal"}
            </Button>
          </div>
        </div>

        {showAddForm && (
          <Card>
            <CardContent className="p-4 grid gap-3 sm:grid-cols-3">
              <Input placeholder="Malın adı" value={newProduct.nameAz} onChange={e => setNewProduct({...newProduct, nameAz: e.target.value})} />
              <select value={newProduct.productType} onChange={e => setNewProduct({...newProduct, productType: e.target.value})}
                className="h-10 rounded-2xl border border-[var(--border)] bg-white px-3 text-sm">
                <option value="CURTAIN">Pərdə</option>
                <option value="JALOUSIE">Jalüz</option>
                <option value="CORNICE">Karniz</option>
                <option value="OTHER">Digər</option>
              </select>
              <select value={newProduct.unit} onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                className="h-10 rounded-2xl border border-[var(--border)] bg-white px-3 text-sm">
                <option value="metr">Metr</option>
                <option value="ədəd">Ədəd</option>
                <option value="m²">m²</option>
              </select>
              <Input type="number" placeholder="Alış qiyməti" value={newProduct.costPrice} onChange={e => {
                const cost = e.target.value;
                const sale = cost && newProduct.marginPct ? (Number(cost) * (1 + Number(newProduct.marginPct) / 100)).toFixed(2) : newProduct.salePrice;
                setNewProduct({...newProduct, costPrice: cost, salePrice: sale});
              }} />
              <Input type="number" placeholder="Faiz (%)" value={newProduct.marginPct} onChange={e => {
                const pct = e.target.value;
                const sale = newProduct.costPrice && pct ? (Number(newProduct.costPrice) * (1 + Number(pct) / 100)).toFixed(2) : newProduct.salePrice;
                setNewProduct({...newProduct, marginPct: pct, salePrice: sale});
              }} />
              <Input type="number" placeholder="Satış qiyməti" value={newProduct.salePrice} onChange={e => setNewProduct({...newProduct, salePrice: e.target.value})} />
              <Input type="number" placeholder="Qalıq (stok)" value={newProduct.stock} onChange={e => setNewProduct({...newProduct, stock: e.target.value})} />
              <Input type="number" placeholder="Min stok" value={newProduct.minStock} onChange={e => setNewProduct({...newProduct, minStock: e.target.value})} />
              <div className="sm:col-span-3 flex gap-2">
                <Button className="flex-1" onClick={async () => {
                  if (!newProduct.nameAz || !newProduct.salePrice) { alert("Ad və satış qiyməti tələb olunur"); return; }
                  try {
                    await apiFetch("/inventory", { method: "POST", body: JSON.stringify({ code: "", nameAz: newProduct.nameAz, productType: newProduct.productType, unit: newProduct.unit, costPrice: Number(newProduct.costPrice || 0), marginPct: Number(newProduct.marginPct || 0), salePrice: Number(newProduct.salePrice), stock: Number(newProduct.stock || 0), minStock: Number(newProduct.minStock || 0) }) });
                    setShowAddForm(false);
                    load();
                  } catch (err) { alert(err instanceof Error ? err.message : "Xəta"); }
                }}>Əlavə et</Button>
                <Button variant="outline" className="flex-1" onClick={() => setShowAddForm(false)}>Ləğv et</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {importResult && (
          <Card className="border-[var(--success)]/30 bg-[var(--success-soft)]">
            <CardContent className="p-4 text-sm">
              <p className="font-semibold text-[var(--success)]">
                İdxal tamamlandı: {importResult.created} yeni · {importResult.updated} yeniləndi · {importResult.errors} xəta
              </p>
              {importResult.errorList.length > 0 && (
                <p className="mt-1 text-[var(--warning)]">{importResult.errorList.slice(0, 5).join(", ")}</p>
              )}
              <Button variant="ghost" className="mt-2 h-6 text-xs" onClick={() => setImportResult(null)}>Bağla</Button>
            </CardContent>
          </Card>
        )}

        {lowStock.length > 0 && (
          <Card className="border-[var(--warning)]/30 bg-[var(--warning-soft)]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-[var(--warning)]">Aşağı stok: {lowStock.length} məhsul</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {lowStock.slice(0, 8).map(p => (
                <Badge key={p.id} variant="warning" className="text-xs">{p.nameAz} ({p.stock} {p.unit})</Badge>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Məhsul axtar (ad, kod)..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="sm:w-72"
          />
          <div className="flex flex-wrap gap-2">
            {(["", "CURTAIN", "JALOUSIE", "CORNICE", "OTHER"] as const).map(t => (
              <button key={t} onClick={() => { setTypeFilter(t); setPage(1); }}
                className={`rounded-[18px] border px-3 py-1.5 text-sm transition ${typeFilter === t ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white/60 hover:border-[var(--accent)]"}`}>
                {t === "" ? "Hamısı" : PRODUCT_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--soft-navy)]/50">
                    <th className="px-4 py-3 text-left font-semibold">Kod</th>
                    <th className="px-4 py-3 text-left font-semibold">Ad</th>
                    <th className="px-4 py-3 text-left font-semibold">Tip</th>
                    {isAdmin && <th className="px-4 py-3 text-right font-semibold">Alış ₼</th>}
                    <th className="px-4 py-3 text-right font-semibold">Satış ₼</th>
                    <th className="px-4 py-3 text-right font-semibold">Qalıq</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-center font-semibold">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--muted-foreground)]">Yüklənir...</td></tr>
                  ) : products.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--muted-foreground)]">Məhsul tapılmadı</td></tr>
                  ) : products.map(p => (
                    <tr key={p.id} className="border-b border-[var(--border)]/60 hover:bg-[var(--soft-navy)]/20">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--muted-foreground)]">{p.code}</td>
                      <td className="px-4 py-3 font-medium">{p.nameAz}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.productType === "CURTAIN" ? "accent" : p.productType === "JALOUSIE" ? "default" : p.productType === "CORNICE" ? "warning" : "secondary"} className="text-xs">
                          {PRODUCT_TYPE_LABELS[p.productType]}
                        </Badge>
                      </td>
                      {isAdmin && <td className="px-4 py-3 text-right text-[var(--muted-foreground)]">{p.costPrice?.toFixed(2) ?? "—"}</td>}
                      <td className="px-4 py-3 text-right font-semibold">₼ {p.salePrice.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${p.stock <= p.minStock ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                        {p.stock} {p.unit}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.stock === 0
                          ? <Badge variant="destructive" className="text-xs">Bitmişdir</Badge>
                          : p.stock <= p.minStock
                          ? <Badge variant="warning" className="text-xs">Az qalıb</Badge>
                          : <Badge variant="success" className="text-xs">Var</Badge>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setAdjustProduct(p)}
                            className="rounded-xl border border-[var(--border)] bg-white/60 px-2 py-1 text-xs hover:border-[var(--primary)] transition">
                            Düzəliş
                          </button>
                          <button onClick={() => printLabel(p)}
                            className="rounded-xl border border-[var(--border)] bg-white/60 px-2 py-1 text-xs hover:border-[var(--accent)] transition">
                            Etiket
                          </button>
                          {user?.role === "ADMIN" && (
                            <button onClick={async () => {
                              if (!confirm(`"${p.nameAz}" malını silmək istəyirsiniz?`)) return;
                              try {
                                await apiFetch(`/inventory/${p.id}`, { method: "DELETE" });
                                load();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : "Xəta");
                              }
                            }}
                              className="rounded-xl border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100 transition">
                              Sil
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Əvvəlki</Button>
                <span className="text-sm text-[var(--muted-foreground)]">{page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sonrakı →</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">CSV/Excel Import Formatı</CardTitle>
            <CardDescription>Access-dən export edilən fayl bu sütunları dəstəkləyir</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <code className="block rounded-xl bg-[var(--soft-navy)] p-3 font-mono text-xs leading-6">
              Malin Kodu;Adi;Alis;Faiz;Satis;Qaliq;Vahidi;Tip<br/>
              PRD-001;Tül pərdə ağ;2.50;80;4.50;150;m;CURTAIN<br/>
              JAL-001;Üfüqi jalüz;8.00;75;14.00;200;m²;JALOUSIE<br/>
              KRN-001;Sadə karniz;2.00;50;3.00;100;m;CORNICE
            </code>
            <p className="mt-2 text-[var(--muted-foreground)]">Ayırıcı: nöqtəli vergül (;) və ya vergül (,). Tip: CURTAIN, JALOUSIE, CORNICE, OTHER.</p>
          </CardContent>
        </Card>
      </div>

      {adjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,18,40,0.6)]">
          <Card className="glass-panel w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Stok düzəlişi</CardTitle>
              <CardDescription>{adjustProduct.nameAz} · Mövcud: {adjustProduct.stock} {adjustProduct.unit}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-semibold">Dəyişim (+ gəldi / - getdi)</label>
                <Input type="number" placeholder="+50 və ya -10" value={adjustDelta} onChange={e => setAdjustDelta(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-semibold">Səbəb</label>
                <Input placeholder="Alış, itki, sayım..." value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleAdjust}>Yadda saxla</Button>
                <Button variant="outline" className="flex-1" onClick={() => setAdjustProduct(null)}>Ləğv et</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
