"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi } from "../../lib/auth/auth-context";

type DailyPrintData = {
  date: string;
  totalSalesAmt: number;
  totalDiscount: number;
  totalDeposit: number;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalExpenses: number;
  netCash: number;
  salesCount: number;
  sales: { saleNumber: string; total: number; deposit: number; debt: number; sellerName: string; time: string }[];
  expenses: { category: string; amount: number; description?: string; userName: string; time: string }[];
};

export default function DailyReportPage() {
  const apiFetch = useApi();
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<DailyPrintData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!date) return;
    setLoading(true);
    apiFetch<DailyPrintData>(`/reports/daily-print?date=${date}`)
      .then(setData)
      .catch((err) => alert(err instanceof Error ? err.message : "Xəta baş verdi"))
      .finally(() => setLoading(false));
  }, [apiFetch, date]);

  useEffect(() => { load(); }, [load]);

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">Günlük Açot (Z-Report)</h1>
            <p className="text-sm text-[var(--muted-foreground)]">Günün sonunda kassanı təhvil vermək üçün xülasə</p>
          </div>
          <div className="flex gap-2 items-end">
            <div>
              <label className="text-xs font-semibold">Tarix</label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
            </div>
            <Button onClick={load} disabled={loading} variant="outline">Yenilə</Button>
            <Button onClick={() => window.print()} disabled={!data || loading}>🖨️ Çap Et</Button>
          </div>
        </div>

        {loading && <p className="text-sm text-[var(--muted-foreground)] print:hidden">Yüklənir...</p>}
        
        {data && !loading && (
          <div id="print-area" className="bg-white p-6 sm:p-8 rounded-[24px] border border-[var(--border)] print:border-none print:p-0 print:m-0 print:shadow-none">
            {/* Header for Print */}
            <div className="text-center mb-8 border-b-2 border-black pb-4">
              <h2 className="text-2xl font-bold uppercase tracking-widest">GÜNLÜK AÇOT</h2>
              <p className="text-lg mt-1 font-semibold">{new Date(data.date).toLocaleDateString("az-AZ")}</p>
            </div>

            {/* Totals Summary */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8 text-sm">
              <div className="flex justify-between border-b border-gray-200 py-1">
                <span className="font-semibold">Ümumi Satış Məbləği:</span>
                <span>₼ {data.totalSalesAmt.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 py-1">
                <span className="font-semibold">Satış Sayı:</span>
                <span>{data.salesCount} ədəd</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 py-1">
                <span className="font-semibold">Endirimlər:</span>
                <span className="text-red-600">₼ {data.totalDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 py-1">
                <span className="font-semibold">Alınan Behlər/Ödənişlər (Ümumi):</span>
                <span>₼ {data.totalDeposit.toFixed(2)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              {/* Payment Types Breakdown */}
              <div>
                <h3 className="font-bold border-b border-black pb-1 mb-2">Ödəniş Növlərinə Görə</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="font-semibold">Nağd (Kassa):</span> <span>₼ {data.totalCash.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Kart (Terminal):</span> <span>₼ {data.totalCard.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Köçürmə:</span> <span>₼ {data.totalTransfer.toFixed(2)}</span></div>
                </div>
              </div>

              {/* Final Cash Calculation */}
              <div className="bg-gray-50 p-4 border border-gray-300 rounded-lg">
                <h3 className="font-bold border-b border-gray-300 pb-1 mb-2">Kassa Qalığı (Nağd Pul)</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="font-semibold">Nağd Gəlirlər cəmi:</span> <span>₼ {data.totalCash.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Xərclər cəmi:</span> <span className="text-red-600">- ₼ {data.totalExpenses.toFixed(2)}</span></div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-gray-300 text-base font-bold">
                    <span>XALİS NAĞD KASSA:</span> 
                    <span>₼ {data.netCash.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Expenses List */}
            <div className="mb-8">
              <h3 className="font-bold border-b border-black pb-1 mb-2">Günün Xərcləri</h3>
              {data.expenses.length === 0 ? (
                <p className="text-sm italic">Bu gün üçün xərc yoxdur.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-300 text-left">
                      <th className="py-1">Kateqoriya</th>
                      <th className="py-1">İzah</th>
                      <th className="py-1 text-right">Məbləğ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.map((e, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-1 font-semibold">{e.category}</td>
                        <td className="py-1 text-gray-600">{e.description || "-"}</td>
                        <td className="py-1 text-right text-red-600">₼ {e.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td colSpan={2} className="py-2 text-right">CƏM XƏRC:</td>
                      <td className="py-2 text-right">₼ {data.totalExpenses.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Sales List */}
            <div>
              <h3 className="font-bold border-b border-black pb-1 mb-2">Günün Satışları (Qısa İcmal)</h3>
              {data.sales.length === 0 ? (
                <p className="text-sm italic">Bu gün üçün satış yoxdur.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-300 text-left">
                      <th className="py-1">Çek #</th>
                      <th className="py-1">Satıcı</th>
                      <th className="py-1 text-right">Satış (₼)</th>
                      <th className="py-1 text-right">Beh/Ödənilib</th>
                      <th className="py-1 text-right">Borc Qalıq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sales.map((s, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-1 text-xs font-mono">#{s.saleNumber.slice(-8)}</td>
                        <td className="py-1">{s.sellerName}</td>
                        <td className="py-1 text-right">₼ {s.total.toFixed(2)}</td>
                        <td className="py-1 text-right">₼ {s.deposit.toFixed(2)}</td>
                        <td className="py-1 text-right text-red-600">{s.debt > 0 ? `₼ ${s.debt.toFixed(2)}` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Print Signatures */}
            <div className="mt-16 flex justify-between px-8 print:mt-24">
              <div className="text-center">
                <div className="w-40 border-b border-black mb-2"></div>
                <p className="text-sm font-semibold">Təhvil verdi (Satıcı)</p>
              </div>
              <div className="text-center">
                <div className="w-40 border-b border-black mb-2"></div>
                <p className="text-sm font-semibold">Təhvil aldı (Müdiriyyət)</p>
              </div>
            </div>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}} />
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
