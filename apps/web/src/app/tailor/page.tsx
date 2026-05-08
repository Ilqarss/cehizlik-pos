"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { DashboardShell } from "../../components/layout/dashboard-shell";
import { useApi, useAuth } from "../../lib/auth/auth-context";
import { TAILOR_STATUS_LABELS, type TailorStatus } from "@cehizlik/types";

type TailorOrder = {
  id: string;
  status: TailorStatus;
  width?: number; height?: number;
  meters?: number; buzmeFactor?: number;
  model?: string; color?: string;
  customNote?: string;
  stitchType?: string;
  bonusPerUnit?: number;
  totalBonus?: number;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  sale?: {
    id: string; saleNumber: string; soldAt: string;
    customer?: { id: string; name: string; phone: string };
  };
  tailor?: { id: string; fullName: string };
};

const STATUS_COLORS: Record<TailorStatus, string> = {
  WAITING: "border-[var(--warning)]/40 bg-[var(--warning-soft)]",
  IN_PROGRESS: "border-[var(--accent)]/40 bg-[var(--accent)]/5",
  READY: "border-[var(--success)]/40 bg-[var(--success-soft)]"
};

const STATUS_BADGE: Record<TailorStatus, "warning" | "accent" | "success"> = {
  WAITING: "warning",
  IN_PROGRESS: "accent",
  READY: "success"
};

export default function TailorPage() {
  const { user } = useAuth();
  const apiFetch = useApi();
  const isAdmin = user?.role === "ADMIN";

  const [orders, setOrders] = useState<TailorOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<TailorStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (statusFilter) params.set("status", statusFilter);

    apiFetch<{ items: TailorOrder[]; total: number }>(`/tailor?${params}`)
      .then(d => { setOrders(d.items); setTotal(d.total); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [apiFetch, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function changeStatus(orderId: string, newStatus: TailorStatus, stitchType?: string) {
    setUpdating(orderId);
    try {
      const body: Record<string, string> = { status: newStatus };
      if (stitchType) body.stitchType = stitchType;
      const updated = await apiFetch<TailorOrder>(`/tailor/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
      setOrders(prev => prev.map(o =>
        o.id === orderId ? { ...o, ...updated, status: newStatus } : o
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Xəta");
    } finally {
      setUpdating(null);
    }
  }

  const grouped = {
    WAITING: orders.filter(o => o.status === "WAITING"),
    IN_PROGRESS: orders.filter(o => o.status === "IN_PROGRESS"),
    READY: orders.filter(o => o.status === "READY")
  };

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="display-font text-3xl text-[var(--primary)]">Dərzi Paneli</h1>
            <p className="text-sm text-[var(--muted-foreground)]">{total} sifariş</p>
          </div>
          <div className="flex gap-2">
            {(["", "WAITING", "IN_PROGRESS", "READY"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`rounded-[18px] border px-3 py-1.5 text-xs font-semibold transition ${statusFilter === s ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white/60 hover:border-[var(--accent)]"}`}>
                {s === "" ? "Hamısı" : TAILOR_STATUS_LABELS[s]}
                {s !== "" && <span className="ml-1 opacity-70">({grouped[s].length})</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Kanban görünüşü */}
        {statusFilter === "" ? (
          <div className="grid gap-6 lg:grid-cols-3">
            {(["WAITING", "IN_PROGRESS", "READY"] as TailorStatus[]).map(status => (
              <div key={status}>
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant={STATUS_BADGE[status]} className="text-sm px-3 py-1">
                    {TAILOR_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-sm text-[var(--muted-foreground)]">({grouped[status].length})</span>
                </div>
                <div className="space-y-3">
                  {loading ? (
                    <p className="text-sm text-[var(--muted-foreground)]">Yüklənir...</p>
                  ) : grouped[status].length === 0 ? (
                    <div className="rounded-[22px] border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
                      Sifariş yoxdur
                    </div>
                  ) : grouped[status].map(order => (
                    <OrderCard key={order.id} order={order} isAdmin={isAdmin} onStatusChange={changeStatus} updating={updating} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[var(--muted-foreground)]">Yüklənir...</p>
            ) : orders.length === 0 ? (
              <p className="text-center text-sm text-[var(--muted-foreground)]">Sifariş tapılmadı</p>
            ) : orders.map(order => (
              <OrderCard key={order.id} order={order} isAdmin={isAdmin} onStatusChange={changeStatus} updating={updating} />
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function OrderCard({ order, isAdmin, onStatusChange, updating }: {
  order: TailorOrder;
  isAdmin: boolean;
  onStatusChange: (id: string, status: TailorStatus, stitchType?: string) => Promise<void>;
  updating: string | null;
}) {
  const isUpdating = updating === order.id;

  return (
    <div className={`rounded-[24px] border p-4 ${STATUS_COLORS[order.status]}`}>
      {/* Müştəri */}
      {order.sale?.customer && (
        <div className="mb-2">
          <p className="font-semibold text-sm">{order.sale.customer.name}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{order.sale.customer.phone}</p>
        </div>
      )}

      {/* Sifariş detalları */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {order.meters && (
          <Spec label="Metr" value={`${order.meters} m`} />
        )}
        {order.buzmeFactor && (
          <Spec label="Büzmə" value={`x${order.buzmeFactor}`} />
        )}
        {order.width && order.height && (
          <Spec label="Ölçü" value={`${order.width} × ${order.height} m`} />
        )}
        {order.model && (
          <Spec label="Model" value={order.model} />
        )}
        {order.color && (
          <Spec label="Rəng" value={order.color} />
        )}
        {order.dueDate && (
          <Spec label="Son tarix" value={new Date(order.dueDate).toLocaleDateString("az-AZ")} />
        )}
      </div>

      {order.customNote && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)] italic">{order.customNote}</p>
      )}

      {/* Dərzi */}
      {isAdmin && order.tailor && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Dərzi: {order.tailor.fullName}</p>
      )}

      {/* Tikiş növü (satışda avtomatik təyin olunur, dəyişdirilə bilməz) */}
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="text-[var(--muted-foreground)]">Tikiş:</span>
        <span className="rounded-lg border border-[var(--border)] bg-gray-50 px-2 py-0.5 text-xs font-medium">
          {(order.stitchType ?? "straight") === "buzme" ? "Büzmə" : "Düz"}
          {order.bonusPerUnit !== undefined ? ` (${order.bonusPerUnit.toFixed(2)} AZN/m)` : ""}
        </span>
        {order.totalBonus !== undefined && order.totalBonus > 0 && (
          <span className="text-[var(--accent)] font-semibold">Bonus: ₼ {order.totalBonus.toFixed(2)}</span>
        )}
      </div>

      {/* Status dəyiş düymələri */}
      <div className="mt-3 flex flex-wrap gap-2">
        {(["WAITING", "IN_PROGRESS", "READY"] as TailorStatus[]).filter(s => s !== order.status).map(s => (
          <button
            key={s}
            disabled={isUpdating}
            onClick={() => onStatusChange(order.id, s)}
            className="rounded-[14px] border border-[var(--border)] bg-white/80 px-2 py-1 text-xs font-semibold hover:border-[var(--primary)] transition disabled:opacity-50"
          >
            {isUpdating ? "..." : `→ ${TAILOR_STATUS_LABELS[s]}`}
          </button>
        ))}
        {order.completedAt && (
          <span className="text-xs text-[var(--success)]">
            Hazır: {new Date(order.completedAt).toLocaleDateString("az-AZ")}
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-[var(--muted-foreground)]/60">
        {order.sale?.saleNumber ? `Çek: #${order.sale.saleNumber.slice(-8)} · ` : ""}
        {new Date(order.createdAt).toLocaleDateString("az-AZ")}
      </p>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-white/40 bg-white/50 px-2 py-1">
      <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wide">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
