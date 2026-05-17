"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";
import { BUZME_FACTORS, PAYMENT_LABELS, PRODUCT_TYPE_LABELS, INSTALLATION_TYPE_LABELS, type BuzmeFactor, type PaymentType, type InstallationType } from "@cehizlik/types";

type Product = {
  id: string; code: string; nameAz: string;
  productType: "CURTAIN" | "JALOUSIE" | "CORNICE" | "OTHER";
  unit: string; salePrice: number; stock: number;
};

type CartItem = {
  key: string;
  product: Product;
  meters?: number;
  buzmeFactor?: BuzmeFactor;
  widthM?: number;
  heightM?: number;
  quantity?: number;
  lineTotal: number;
  squareM?: number;
  discountAmt: number;
  tailorNote?: string;
  tailorModel?: string;
  tailorDueDate?: string;
  tailorId?: string;
  ustaId?: string;
  installationType?: InstallationType;
  installationFeeAmt?: number;
};

type Customer = { id: string; name: string; phone: string; totalDebt: number };

export default function SalesPage() {
  const { user } = useAuth();
  const apiFetch = useApi();

  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [discountAmt, setDiscountAmt] = useState(0);
  const [deposit, setDeposit] = useState(0);
  const [paymentType, setPaymentType] = useState<PaymentType>("CASH");
  const [saleNote, setSaleNote] = useState("");
  const [createTailorOrders, setCreateTailorOrders] = useState(false);
  const [tailors, setTailors] = useState<{ id: string; fullName: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSale, setLastSale] = useState<any>(null);
  const [maxDiscountPct, setMaxDiscountPct] = useState<number | null>(null);
  const [sellers, setSellers] = useState<{ id: string; fullName: string }[]>([]);
  const [ustas, setUstas] = useState<{ id: string; fullName: string }[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [ustaFees, setUstaFees] = useState({ straight: 2, curved: 5, jalousie: 10 });

  useEffect(() => {
    if (user?.id && !selectedSellerId) {
      setSelectedSellerId(user.id);
    }
  }, [user, selectedSellerId]);

  useEffect(() => {
    apiFetch<{ key: string; value: string } | null>("/settings/max_discount_pct")
      .then(d => { if (d?.value) setMaxDiscountPct(Number(d.value)); })
      .catch(() => undefined);
    // Dərziləri yüklə
    apiFetch<{ items: { id: string; fullName: string }[] }>("/tailor/tailors")
      .then(d => setTailors(d.items ?? []))
      .catch(() => undefined);
      
    // Usta yüklə
    apiFetch<{ items: { id: string; fullName: string }[] }>("/users/ustas")
      .then(d => setUstas(d.items ?? []))
      .catch(() => undefined);
      
    // Usta qiymətləri
    Promise.all([
      apiFetch<{ value: string }>("/settings/usta_fee_straight_cornice").catch(() => null),
      apiFetch<{ value: string }>("/settings/usta_fee_curved_cornice").catch(() => null),
      apiFetch<{ value: string }>("/settings/usta_fee_jalousie").catch(() => null)
    ]).then(([s, c, j]) => {
      setUstaFees({
        straight: s?.value ? Number(s.value) : 2,
        curved: c?.value ? Number(c.value) : 5,
        jalousie: j?.value ? Number(j.value) : 10
      });
    });

    // Satıcıları yüklə
    apiFetch<{ items: { id: string; fullName: string }[] }>("/users/sellers")
      .then(d => setSellers(d.items ?? []))
      .catch(() => undefined);
  }, [apiFetch]);

  useEffect(() => {
    if (!productSearch) { setProducts([]); return; }
    const t = setTimeout(() => {
      apiFetch<{ items: Product[] }>(`/inventory?q=${encodeURIComponent(productSearch)}&limit=20`)
        .then(d => setProducts(d.items))
        .catch(() => undefined);
    }, 280);
    return () => clearTimeout(t);
  }, [apiFetch, productSearch]);

  const searchCustomer = useCallback(() => {
    if (!customerPhone) return;
    apiFetch<Customer>(`/customers?q=${encodeURIComponent(customerPhone)}&limit=1`)
      .then(d => {
        const c = (d as unknown as { items: Customer[] }).items?.[0];
        if (c) { setFoundCustomer(c); setCustomerName(c.name); }
        else setFoundCustomer(null);
      })
      .catch(() => setFoundCustomer(null));
  }, [apiFetch, customerPhone]);

  function addToCart(product: Product) {
    const key = `${product.id}_${Date.now()}`;
    const item: CartItem = {
      key,
      product,
      quantity: product.productType === "OTHER" ? 1 : undefined,
      meters: product.productType === "CURTAIN" ? 1 : undefined,
      buzmeFactor: product.productType === "CURTAIN" ? 2 : undefined,
      widthM: product.productType === "JALOUSIE" ? 1 : undefined,
      heightM: product.productType === "JALOUSIE" ? 1 : undefined,
      discountAmt: 0,
      lineTotal: 0,
      installationFeeAmt: 0,
      installationType: product.productType === "JALOUSIE" ? "JALOUSIE" : undefined
    };
    setCart(prev => [...prev, calcItem(item)]);
    setProductSearch("");
  }

  function calcItem(item: CartItem): CartItem {
    let lineTotal = 0;
    let squareM: number | undefined;

    if (item.product.productType === "CURTAIN" && item.meters && item.buzmeFactor) {
      lineTotal = item.meters * item.buzmeFactor * item.product.salePrice;
    } else if (item.product.productType === "JALOUSIE" && item.widthM && item.heightM) {
      squareM = Math.max(item.widthM * item.heightM, 1);
      lineTotal = squareM * item.product.salePrice;
    } else if (item.product.productType === "CORNICE" && item.meters) {
      lineTotal = item.meters * item.product.salePrice;
    } else {
      lineTotal = (item.quantity ?? 1) * item.product.salePrice;
    }
    
    let instFee = 0;
    if (item.ustaId && item.installationType) {
      if (item.installationType === "STRAIGHT_CORNICE") instFee = (item.meters ?? 1) * ustaFees.straight;
      else if (item.installationType === "CURVED_CORNICE") instFee = (item.meters ?? 1) * ustaFees.curved;
      else if (item.installationType === "JALOUSIE") instFee = ustaFees.jalousie; // 1 piece
    }

    lineTotal += instFee;
    lineTotal = Math.max(lineTotal - (item.discountAmt ?? 0), 0);
    return { ...item, lineTotal, squareM, installationFeeAmt: instFee };
  }

  function updateItem(key: string, patch: Partial<CartItem>) {
    setCart(prev => prev.map(item => item.key === key ? calcItem({ ...item, ...patch }) : item));
  }

  function removeItem(key: string) {
    setCart(prev => prev.filter(item => item.key !== key));
  }

  const subtotal = cart.reduce((s, i) => s + i.lineTotal, 0);
  const afterPct = subtotal - (subtotal * discountPct) / 100;
  const total = Math.max(afterPct - discountAmt, 0);
  const totalPaid = deposit;
  const debt = Math.max(total - totalPaid, 0);

  async function handleSubmit() {
    if (cart.length === 0) { alert("Səbət boşdur"); return; }
    
    // Validation
    for (const item of cart) {
      if (item.product.productType === "CORNICE" && item.ustaId && !item.installationType) {
        alert(`Diqqət: "${item.product.nameAz}" üçün usta seçmisiniz, lakin karniz növünü (Düz/Əyri) seçməmisiniz. Zəhmət olmasa növü seçin.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const result = await apiFetch<{ saleNumber: string; total: number; debt: number }>("/sales", {
        method: "POST",
        body: JSON.stringify({
          customerId: foundCustomer?.id,
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          items: cart.map(item => ({
            productId: item.product.id,
            meters: item.meters,
            buzmeFactor: item.buzmeFactor,
            widthM: item.widthM,
            heightM: item.heightM,
            quantity: item.quantity,
            discountAmt: item.discountAmt,
            tailorNote: item.tailorNote,
            tailorModel: item.tailorModel,
            tailorDueDate: item.tailorDueDate,
            tailorId: item.tailorId,
            ustaId: item.ustaId,
            installationType: item.installationType
          })),
          payments: [{ paymentType, amount: 0 }],
          discountPct,
          discountAmt,
          deposit,
          note: saleNote,
          receiptWidth: "80mm",
          createTailorOrders,
          sellerId: selectedSellerId || user?.id
        })
      });

      const selectedTailor = cart.find(i => i.tailorId)?.tailorId;
      const tailorName = selectedTailor ? tailors.find(t => t.id === selectedTailor)?.fullName : undefined;
      setLastSale({ 
        ...result, 
        deposit, 
        tailorName, 
        items: [...cart], 
        customerName, 
        customerPhone,
        paymentType,
        sellerName: sellers.find(s => s.id === (selectedSellerId || user?.id))?.fullName || user?.fullName || ""
      });
      setCart([]);
      setCustomerPhone("");
      setCustomerName("");
      setFoundCustomer(null);
      setDiscountPct(0);
      setDiscountAmt(0);
      setDeposit(0);
      setSaleNote("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Satış alınmadı");
    } finally {
      setSubmitting(false);
    }
  }

  function printReceipt() {
    if (!lastSale) return;
    
    function toLatin(str: string): string {
      if (!str) return "";
      const az: Record<string, string> = { 'ə': 'e', 'Ə': 'E', 'ş': 's', 'Ş': 'S', 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ö': 'o', 'Ö': 'O', 'ü': 'u', 'Ü': 'U', 'ı': 'i', 'İ': 'I' };
      return str.replace(/[əƏşŞçÇğĞöÖüÜıİ]/g, match => az[match] || match);
    }

    const now = new Date();
    const d = now.toLocaleDateString("az-AZ");
    const t = now.toLocaleTimeString("az-AZ", {hour:"2-digit",minute:"2-digit"});
    const s = "------------------------------";
    
    const items = (lastSale.items || []).map((item: CartItem, i: number) => {
      const nm = item.product.nameAz.length > 20 ? item.product.nameAz.slice(0,20) + ".." : item.product.nameAz;
      const det = item.product.productType === "CURTAIN" ? (item.meters??0)+"m x"+(item.buzmeFactor??1) 
                : item.product.productType === "JALOUSIE" ? (item.widthM??0)+"x"+(item.heightM??0)+"m" 
                : (item.quantity??1)+"ed";
      
      let html = `<div class="r"><span>${i+1}.${toLatin(nm)}</span></div>
                  <div class="r"><span>  ${det} x ${item.product.salePrice}AZN</span><span>${item.lineTotal.toFixed(2)}</span></div>`;
      
      if (item.discountAmt > 0) {
        html += `<div class="r" style="font-size:6pt; color:#444;"><span>  - Endirim</span><span>-${item.discountAmt.toFixed(2)}</span></div>`;
      }
      if (item.ustaId && item.installationFeeAmt) {
        html += `<div class="r" style="font-size:6pt; color:#444;"><span>  - Usta qurasdirma</span><span>Daxildir</span></div>`;
      }
      return html;
    }).join("");

    const paymentTypeStr = lastSale.paymentType === "CARD" ? "Kart" : lastSale.paymentType === "TRANSFER" ? "Kocurme" : "Nagd";
    
    // Subtotal in lastSale does not include discount.
    const subtotal = lastSale.items?.reduce((acc: number, it: CartItem) => acc + (it.lineTotal + it.discountAmt), 0) || lastSale.total;
    const totalDiscount = subtotal - lastSale.total;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>
      @page{size:58mm auto;margin:0!important;}
      *{margin:0;padding:0;}
      body{width:56mm;margin:0!important;padding:1mm;font-family:monospace;font-size:7pt;color:#000;line-height:1.2;}
      .c{text-align:center;}
      .b{font-weight:bold;}
      .r{display:flex;justify-content:space-between;}
      .big{font-size:9pt;font-weight:bold;}
    </style></head><body>
      <div class="c b" style="font-size:11pt;">IL & AY</div>
      <div class="c" style="font-size:6pt;">PERDE VE JALUZ MAGAZASI</div>
      <div>${s}</div>
      <div class="r"><span>Cek:</span><span>#${lastSale.saleNumber.slice(-8)}</span></div>
      <div class="r"><span>${d}</span><span>${t}</span></div>
      <div class="r"><span>Satici:</span><span>${toLatin(lastSale.sellerName || (user?.fullName ?? "")).slice(0,16)}</span></div>
      ${lastSale.customerName ? `<div class="r"><span>Must:</span><span>${toLatin(lastSale.customerName).slice(0,18)}</span></div>` : ""}
      ${lastSale.customerPhone ? `<div class="r"><span>Tel:</span><span>${lastSale.customerPhone}</span></div>` : ""}
      <div>${s}</div>
      ${items}
      <div>${s}</div>
      <div class="r"><span>Yekun:</span><span>${subtotal.toFixed(2)} AZN</span></div>
      ${totalDiscount > 0 ? `<div class="r"><span>Endirim:</span><span>-${totalDiscount.toFixed(2)} AZN</span></div>` : ""}
      <div class="r big"><span>ODENILECEK:</span><span>${lastSale.total.toFixed(2)} AZN</span></div>
      <div>${s}</div>
      ${lastSale.deposit > 0 ? `<div class="r"><span>Odenildi (${paymentTypeStr}):</span><span>${lastSale.deposit.toFixed(2)} AZN</span></div>` : `<div class="r"><span>Odenis novu:</span><span>${paymentTypeStr}</span></div>`}
      ${lastSale.debt > 0 ? `<div class="r big"><span>Qaliq Borc:</span><span>${lastSale.debt.toFixed(2)} AZN</span></div>` : ""}
      ${lastSale.tailorName ? `<div class="r"><span>Derzi:</span><span>${toLatin(lastSale.tailorName)}</span></div>` : ""}
      <div>${s}</div>
      <div class="c b" style="font-size:6pt;">* Kesilen mal geri qaytarilmir *</div>
      <div class="c" style="font-size:7pt;">Bizi secdiyiniz ucun tesekkurler!</div>
      <div class="c b" style="font-size:7pt;">Tel: 050 385 99 96</div>
      <div>${s}</div>
      <div style="height:50mm;"></div>
      <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500)}<\\/script>
    </body></html>`;
    const win = window.open("","_blank","width=300,height=400");
    win?.document.write(html);
    win?.document.close();
  }

  return (
    <DashboardShell>
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {/* Sol: Məhsul kalkulyatoru */}
        <div className="space-y-4">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">Satış Kalkulyatoru</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Pərdə büzmə + Jalüz m² hesabı</p>
          </div>

          {/* Müştəri */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Müştəri</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="flex gap-2">
                <Input
                  placeholder="+994 XX XXX XX XX"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  onBlur={searchCustomer}
                />
                <Button variant="outline" size="sm" onClick={searchCustomer} className="shrink-0">Axtar</Button>
              </div>
              <Input
                placeholder="Müştəri adı"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
              />
              {foundCustomer && (
                <div className="col-span-2 rounded-[18px] border border-[var(--success)]/30 bg-[var(--success-soft)] px-3 py-2 text-sm">
                  <span className="font-semibold text-[var(--success)]">Tapıldı:</span> {foundCustomer.name}
                  {foundCustomer.totalDebt > 0 && (
                    <span className="ml-2 text-[var(--danger)]">· Borc: ₼ {foundCustomer.totalDebt.toFixed(2)}</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Məhsul axtarışı */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Məhsul əlavə et</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Məhsul adı və ya kodu axtar..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              {products.length > 0 && (
                <div className="mt-2 max-h-60 overflow-y-auto space-y-1 rounded-[18px] border border-[var(--border)] bg-white p-1">
                  {products.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className="flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left hover:bg-[var(--soft-navy)]/30 transition"
                    >
                      <div>
                        <span className="font-medium text-sm">{p.nameAz}</span>
                        <span className="ml-2 font-mono text-xs text-[var(--muted-foreground)]">{p.code}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{PRODUCT_TYPE_LABELS[p.productType]}</Badge>
                        <span className="text-sm font-semibold">₼ {p.salePrice.toFixed(2)}/{p.unit}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">({p.stock} qalıb)</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Səbət */}
          {cart.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Səbət ({cart.length} məhsul)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {cart.map(item => (
                  <div key={item.key} className="rounded-[20px] border border-[var(--border)] bg-[var(--background)]/70 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{item.product.nameAz}</p>
                        <p className="text-xs text-[var(--muted-foreground)]">{item.product.code} · ₼ {item.product.salePrice}/{item.product.unit}</p>
                      </div>
                      <button onClick={() => removeItem(item.key)} className="text-[var(--danger)] text-xs hover:underline">Sil</button>
                    </div>

                    {/* Pərdə büzmə */}
                    {item.product.productType === "CURTAIN" && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-xs font-semibold">Metr</label>
                          <Input type="number" min="0.5" step="0.5" value={item.meters ?? 1}
                            onChange={e => updateItem(item.key, { meters: Number(e.target.value) })}
                            className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold">Büzmə əmsalı</label>
                          <select value={item.buzmeFactor ?? 2}
                            onChange={e => updateItem(item.key, { buzmeFactor: Number(e.target.value) as BuzmeFactor })}
                            className="mt-1 h-9 w-full rounded-2xl border border-[var(--border)] bg-white px-2 text-sm">
                            {BUZME_FACTORS.map(f => <option key={f} value={f}>x{f}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold">Hesabat metr</label>
                          <div className="mt-1 flex h-9 items-center rounded-2xl border border-[var(--border)] bg-[var(--soft-navy)]/30 px-3 text-sm font-semibold">
                            {((item.meters ?? 1) * (item.buzmeFactor ?? 2)).toFixed(1)} m
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Jalüz m² */}
                    {item.product.productType === "JALOUSIE" && (
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-xs font-semibold">En (m)</label>
                          <Input type="number" min="0.1" step="0.1" value={item.widthM ?? 1}
                            onChange={e => updateItem(item.key, { widthM: Number(e.target.value) })}
                            className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold">Hündürlük (m)</label>
                          <Input type="number" min="0.1" step="0.1" value={item.heightM ?? 1}
                            onChange={e => updateItem(item.key, { heightM: Number(e.target.value) })}
                            className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold">Alan (min 1 m²)</label>
                          <div className="mt-1 flex h-9 items-center rounded-2xl border border-[var(--border)] bg-[var(--soft-navy)]/30 px-3 text-sm font-semibold">
                            {Math.max((item.widthM ?? 1) * (item.heightM ?? 1), 1).toFixed(2)} m²
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Digər – say */}
                    {item.product.productType === "OTHER" && (
                      <div className="mt-3 sm:w-36">
                        <label className="text-xs font-semibold">Miqdar</label>
                        <Input type="number" min="1" step="1" value={item.quantity ?? 1}
                          onChange={e => updateItem(item.key, { quantity: Number(e.target.value) })}
                          className="mt-1 h-9 text-sm" />
                      </div>
                    )}
                    
                    {/* Karniz üçün metraj */}
                    {item.product.productType === "CORNICE" && (
                      <div className="mt-3 sm:w-36">
                        <label className="text-xs font-semibold">Metr</label>
                        <Input type="number" min="0.5" step="0.5" value={item.meters ?? 1}
                          onChange={e => updateItem(item.key, { meters: Number(e.target.value) })}
                          className="mt-1 h-9 text-sm" />
                      </div>
                    )}
                    
                    {/* Quraşdırma (Usta) Seçimi (Karniz/Jalüz) */}
                    {(item.product.productType === "CORNICE" || item.product.productType === "JALOUSIE") && ustas.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-end rounded-[16px] bg-[var(--soft-navy)]/20 p-2 border border-[var(--border)]/50">
                        <div className="w-full">
                          <label className="text-xs font-semibold text-[var(--primary)] flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Usta seçin
                          </label>
                          <select value={item.ustaId ?? ""} onChange={e => updateItem(item.key, { ustaId: e.target.value })}
                            className="mt-1 h-8 w-full rounded-xl border border-[var(--border)] bg-white px-2 text-xs">
                            <option value="">İstəmirəm</option>
                            {ustas.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                          </select>
                        </div>
                        {item.ustaId && item.product.productType === "CORNICE" && (
                          <div className="w-full">
                            <label className="text-xs font-semibold text-[var(--muted-foreground)]">Karniz Növü</label>
                            <select value={item.installationType ?? ""} onChange={e => updateItem(item.key, { installationType: e.target.value as InstallationType })}
                              className="mt-1 h-8 w-full rounded-xl border border-[var(--border)] bg-white px-2 text-xs">
                              <option value="">Seçin...</option>
                              <option value="STRAIGHT_CORNICE">Düz ({ustaFees.straight} ₼/m)</option>
                              <option value="CURVED_CORNICE">Əyri ({ustaFees.curved} ₼/m)</option>
                            </select>
                          </div>
                        )}
                        {item.ustaId && item.installationType && (
                          <div className="w-full text-xs font-semibold text-right sm:text-left self-center">
                            + ₼ {item.installationFeeAmt?.toFixed(2)} quraşdırma
                          </div>
                        )}
                      </div>
                    )}

                    {/* Dərzi qeydi (Pərdə üçün) */}
                    {item.product.productType === "CURTAIN" && createTailorOrders && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        <select value={item.tailorId ?? ""} onChange={e => updateItem(item.key, { tailorId: e.target.value })}
                          className="h-9 rounded-2xl border border-[var(--border)] bg-white px-3 text-xs">
                          <option value="">Dərzi seçin</option>
                          {tailors.map(t => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                        </select>
                        <Input placeholder="Model (Roman, Düz, Pliseli...)" value={item.tailorModel ?? ""}
                          onChange={e => updateItem(item.key, { tailorModel: e.target.value })}
                          className="h-9 text-xs" />
                        <Input placeholder="Xüsusi qeyd" value={item.tailorNote ?? ""}
                          onChange={e => updateItem(item.key, { tailorNote: e.target.value })}
                          className="h-9 text-xs" />
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-end">
                      <span className="font-bold text-[var(--primary)]">₼ {item.lineTotal.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sağ: Ödəniş */}
        <div className="space-y-4">
          <Card className="sticky top-20">
            <CardHeader className="pb-3">
              <CardTitle className="display-font text-2xl">Ödəniş</CardTitle>
              <CardDescription>Beh sistemi və borc izləmə</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Məbləğlər */}
              <div className="space-y-2">
                <Row label="Aralıq cəm" value={`₼ ${subtotal.toFixed(2)}`} />

                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted-foreground)]">Endirim %</span>
                  <div className="flex-1">
                    <Input type="number" min="0" max={maxDiscountPct ?? 100} value={discountPct}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (maxDiscountPct !== null && maxDiscountPct > 0 && val > maxDiscountPct) {
                          setDiscountPct(maxDiscountPct);
                        } else {
                          setDiscountPct(val);
                        }
                      }}
                      className="h-8 text-sm" />
                    {maxDiscountPct !== null && maxDiscountPct > 0 && (
                      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Maks: %{maxDiscountPct}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted-foreground)]">Endirim ₼</span>
                  <Input type="number" min="0" value={discountAmt}
                    onChange={e => setDiscountAmt(Number(e.target.value))}
                    className="h-8 text-sm" />
                </div>

                <Row label="Yekun məbləğ" value={`₼ ${total.toFixed(2)}`} bold />

                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-sm text-[var(--muted-foreground)]">Beh (avans)</span>
                  <Input type="number" min="0" max={total} value={deposit}
                    onChange={e => setDeposit(Number(e.target.value))}
                    className="h-8 text-sm" />
                </div>

                <Row
                  label="Borc (cəri)"
                  value={`₼ ${debt.toFixed(2)}`}
                  className={debt > 0 ? "text-[var(--danger)] font-bold" : "text-[var(--success)]"}
                />
              </div>

              {/* Ödəniş növü */}
              <div>
                <p className="mb-2 text-sm font-semibold">Ödəniş növü</p>
                <div className="flex gap-2">
                  {(["CASH", "CARD", "TRANSFER"] as PaymentType[]).map(pt => (
                    <button key={pt} onClick={() => setPaymentType(pt)}
                      className={`rounded-[16px] border px-3 py-1.5 text-xs font-semibold transition ${paymentType === pt ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white/60 hover:border-[var(--accent)]"}`}>
                      {PAYMENT_LABELS[pt]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Satıcı */}
              <div>
                <p className="mb-2 text-sm font-semibold">Satıcı</p>
                <select
                  value={selectedSellerId}
                  onChange={e => setSelectedSellerId(e.target.value)}
                  className="h-10 w-full rounded-[16px] border border-[var(--border)] bg-white px-3 text-sm transition focus:border-[var(--primary)] focus:outline-none"
                >
                  <option value="">Seçin</option>
                  {sellers.map(s => (
                    <option key={s.id} value={s.id}>{s.fullName}</option>
                  ))}
                </select>
              </div>

              {/* Dərzi sifarişi - yalnız səbətdə pərdə varsa */}
              {cart.some(i => i.product.productType === "CURTAIN") && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={createTailorOrders} onChange={e => setCreateTailorOrders(e.target.checked)}
                    className="h-4 w-4 rounded border border-[var(--border)]" />
                  <span className="text-sm">Pərdə sifarişlərini dərzi panelinə göndər</span>
                </label>
              )}

              {/* Qeyd */}
              <Input placeholder="Qeyd..." value={saleNote} onChange={e => setSaleNote(e.target.value)} className="text-sm" />

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={cart.length === 0 || submitting}
              >
                {submitting ? "Qeyd edilir..." : "Satışı tamamla"}
              </Button>

              {lastSale && (
                <div className="rounded-[18px] border border-[var(--success)]/30 bg-[var(--success-soft)] p-4">
                  <p className="font-semibold text-[var(--success)]">Satış tamamlandı!</p>
                  <p className="text-sm">Çek: {lastSale.saleNumber.slice(-8)}</p>
                  <p className="text-sm">Məbləğ: ₼ {lastSale.total.toFixed(2)}</p>
                  {lastSale.debt > 0 && <p className="text-sm text-[var(--danger)]">Borc: ₼ {lastSale.debt.toFixed(2)}</p>}
                  <Button variant="outline" className="mt-2 w-full text-xs" onClick={printReceipt}>Çek çap et</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}

function Row({ label, value, bold, className }: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className="flex items-center justify-between rounded-[16px] border border-[var(--border)] px-3 py-2">
      <span className="text-sm text-[var(--muted-foreground)]">{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-[var(--primary)]" : ""} ${className ?? ""}`}>{value}</span>
    </div>
  );
}
