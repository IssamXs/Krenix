"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Order } from "@/types";
import { X, Eye, RefreshCw, Package, Truck, CheckCircle2, XCircle, RotateCcw, ClipboardCheck, Clock } from "lucide-react";

/* ─── Status configuration ──────────────────────────────────────────────── */

const STATUSES = [
  { value: "pending",           label: "En attente",                    icon: Clock,          color: "#FFC107", bg: "bg-amber-500/15  text-amber-400  border-amber-500/30"  },
  { value: "confirmed",         label: "Confirmée",                     icon: ClipboardCheck, color: "#3B82F6", bg: "bg-blue-500/15   text-blue-400   border-blue-500/30"   },
  { value: "société_livraison", label: "Chez la société de livraison",  icon: Package,        color: "#8B5CF6", bg: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  { value: "on_the_way",        label: "En cours de livraison",         icon: Truck,          color: "#06B6D4", bg: "bg-cyan-500/15   text-cyan-400   border-cyan-500/30"   },
  { value: "delivered",         label: "Livrée",                        icon: CheckCircle2,   color: "#22C55E", bg: "bg-green-500/15  text-green-400  border-green-500/30"  },
  { value: "cancelled",         label: "Annulée",                       icon: XCircle,        color: "#EF4444", bg: "bg-red-500/15    text-red-400    border-red-500/30"    },
  { value: "returned",          label: "Retournée",                     icon: RotateCcw,      color: "#9CA3AF", bg: "bg-gray-500/15   text-gray-400   border-gray-500/30"   },
] as const;

type StatusValue = typeof STATUSES[number]["value"];

function getStatus(value: string) {
  return STATUSES.find(s => s.value === value) ?? STATUSES[0];
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatus(status);
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${s.bg}`}>
      <Icon size={12} />
      {s.label}
    </span>
  );
}

type FilterStatus = "all" | StatusValue;

/* ─── Detail Modal ───────────────────────────────────────────────────────── */

function OrderDetailModal({
  order,
  onClose,
  onStatusChange,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (id: string, status: StatusValue) => Promise<void>;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [wecanState, setWecanState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [wecanRef, setWecanRef]     = useState<string | null>(null);
  const [wecanError, setWecanError] = useState<string>("");

  const handleChange = async (newStatus: StatusValue) => {
    if (newStatus === order.status) return;
    setIsUpdating(true);
    await onStatusChange(order.id, newStatus);
    setIsUpdating(false);
  };

  const sendToWecan = async () => {
    setWecanState("loading");
    setWecanError("");
    try {
      const res = await fetch("/api/wecan/send-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWecanState("error");
        setWecanError(data.error ?? "Erreur inconnue");
      } else {
        setWecanState("success");
        setWecanRef(data.tracking ?? data.wecan_id ?? "Reçu");
        // Auto-advance status to société_livraison
        if (order.status === "confirmed" || order.status === "pending") {
          await onStatusChange(order.id, "société_livraison");
        }
      }
    } catch {
      setWecanState("error");
      setWecanError("Impossible de contacter le serveur.");
    }
  };

  const s = getStatus(order.status);
  const Icon = s.icon;

  /* Progress timeline */
  const timeline: StatusValue[] = ["pending", "confirmed", "société_livraison", "on_the_way", "delivered"];
  const currentIdx = timeline.indexOf(order.status as StatusValue);
  const isCancelled = order.status === "cancelled" || order.status === "returned";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0c1d36] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
          <div>
            <h3 className="text-white font-semibold text-base">Détails de la commande</h3>
            <p className="text-gray-500 text-xs mt-0.5">
              {new Date(order.created_at).toLocaleDateString("fr-DZ", { dateStyle: "long" })}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Timeline (only for non-cancelled) */}
        {!isCancelled && (
          <div className="px-6 pt-5 pb-2">
            <div className="flex items-center gap-0">
              {timeline.map((step, idx) => {
                const st = getStatus(step);
                const StepIcon = st.icon;
                const done = idx <= currentIdx;
                const active = idx === currentIdx;
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <button
                      onClick={() => handleChange(step)}
                      disabled={isUpdating}
                      title={st.label}
                      style={{ borderColor: done ? st.color : undefined, backgroundColor: active ? st.color : done ? st.color + "33" : undefined }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                        done ? "" : "border-white/15 bg-white/5"
                      } ${isUpdating ? "opacity-50 cursor-wait" : "cursor-pointer hover:opacity-80"}`}
                    >
                      <StepIcon size={14} style={{ color: done ? (active ? "#fff" : st.color) : "#6b7280" }} />
                    </button>
                    {idx < timeline.length - 1 && (
                      <div
                        className="h-0.5 flex-1 mx-1 rounded"
                        style={{ background: idx < currentIdx ? s.color : "rgba(255,255,255,0.08)" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Cliquez sur une étape pour faire avancer la commande
            </p>
          </div>
        )}

        {/* Current status + change dropdown */}
        <div className="px-6 py-4 border-b border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon size={16} style={{ color: s.color }} />
              <span className="text-white font-medium text-sm">Statut actuel</span>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1.5">Changer le statut :</label>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map(st => {
                const StIcon = st.icon;
                const isActive = order.status === st.value;
                return (
                  <button
                    key={st.value}
                    onClick={() => handleChange(st.value as StatusValue)}
                    disabled={isUpdating || isActive}
                    style={{ borderColor: isActive ? st.color : undefined, color: isActive ? st.color : undefined }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      isActive
                        ? "bg-white/5"
                        : "border-white/10 text-gray-400 hover:border-white/25 hover:text-white hover:bg-white/5"
                    } ${isUpdating ? "opacity-50 cursor-wait" : ""}`}
                  >
                    <StIcon size={13} />
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* WECAN Integration */}
        <div className="px-6 py-4 border-b border-white/5">
          <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">🚚 Envoyer à WECAN Delivery</p>

          {wecanState === "success" ? (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3">
              <CheckCircle2 size={18} className="text-green-400 flex-shrink-0" />
              <div>
                <p className="text-green-400 text-sm font-semibold">Commande envoyée à WECAN !</p>
                {wecanRef && <p className="text-green-300/70 text-xs mt-0.5">Référence : {wecanRef}</p>}
              </div>
            </div>
          ) : wecanState === "error" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                <XCircle size={18} className="text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-sm">{wecanError}</p>
              </div>
              <button
                onClick={sendToWecan}
                className="w-full text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/25 rounded-xl py-2 transition-colors"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <button
              onClick={sendToWecan}
              disabled={wecanState === "loading"}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm transition-all bg-gradient-to-r from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white shadow-lg shadow-violet-900/30 disabled:opacity-60 disabled:cursor-wait"
            >
              {wecanState === "loading" ? (
                <><RefreshCw size={15} className="animate-spin" /> Envoi en cours…</>
              ) : (
                <><Truck size={15} /> Envoyer à la société de livraison (WECAN)</>
              )}
            </button>
          )}
        </div>

        {/* Client & Order info */}
        <div className="px-6 py-4 space-y-2 text-sm max-h-64 overflow-y-auto">
          {[
            ["👤  Client",    `${order.customer_prenom} ${order.customer_nom}`],
            ["📞  Téléphone", order.customer_phone],
            ["📍  Wilaya",    order.customer_wilaya],
            ["🏘️  Commune",   order.customer_commune],
            ["🛍️  Produit",   order.product_name],
            ["🎨  Couleur",   order.selected_color],
            ["🔢  Quantité",  String(order.quantity)],
            ["🚚  Livraison", `${order.delivery_fee?.toLocaleString("fr-DZ")} DA`],
            ["💰  Total",     `${order.total_price?.toLocaleString("fr-DZ")} DA`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-gray-500">{k}</span>
              <span className="text-white font-medium text-right max-w-[55%]">{v}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3">
          {isUpdating && (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <RefreshCw size={14} className="animate-spin" />
              Mise à jour…
            </div>
          )}
          <button
            onClick={onClose}
            className="ml-auto px-5 py-2 rounded-xl text-sm border border-white/10 text-gray-400 hover:text-white hover:border-white/25 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function OrdersPage() {
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<FilterStatus>("all");
  const [detail, setDetail]   = useState<Order | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const updateStatus = async (id: string, status: StatusValue) => {
    const orderToUpdate = orders.find(o => o.id === id);
    const wasDelivered  = orderToUpdate?.status === "delivered";

    await supabase.from("orders").update({ status }).eq("id", id);

    // Reduce stock only when first marked delivered
    if (status === "delivered" && !wasDelivered && orderToUpdate?.product_id) {
      const { data: productData } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", orderToUpdate.product_id)
        .single();

      if (productData) {
        const newStock = Math.max(0, productData.stock_quantity - orderToUpdate.quantity);
        await supabase
          .from("products")
          .update({ stock_quantity: newStock })
          .eq("id", orderToUpdate.product_id);
      }
    }

    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    setDetail(d => (d?.id === id ? { ...d, status } : d));
  };

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);
  const countOf  = (s: string) => orders.filter(o => o.status === s).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading font-bold text-white">Commandes</h2>
        <p className="text-gray-500 text-sm mt-1">Suivez et gérez les commandes de vos clients.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
            filter === "all"
              ? "border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]"
              : "border-white/10 text-gray-500 hover:text-white hover:border-white/20"
          }`}
        >
          Toutes ({orders.length})
        </button>
        {STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            style={filter === s.value ? { borderColor: s.color, color: s.color, backgroundColor: s.color + "18" } : undefined}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              filter === s.value
                ? ""
                : "border-white/10 text-gray-500 hover:text-white hover:border-white/20"
            }`}
          >
            {s.label} ({countOf(s.value)})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Chargement…</div>
      ) : (
        <div className="bg-[#0c1d36] border border-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Client", "Wilaya", "Produit", "Couleur", "Total", "Statut", ""].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-600">
                      Aucune commande dans cette catégorie.
                    </td>
                  </tr>
                ) : filtered.map(o => (
                  <tr
                    key={o.id}
                    className="hover:bg-white/[0.02] transition-colors cursor-pointer"
                    onClick={() => setDetail(o)}
                  >
                    <td className="px-5 py-4 text-white font-medium">
                      {o.customer_prenom} {o.customer_nom}
                      <p className="text-gray-500 text-xs font-normal">{o.customer_phone}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-400">
                      {o.customer_wilaya}
                      <p className="text-gray-600 text-xs">{o.customer_commune}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-300 max-w-[180px]">
                      <p className="truncate">{o.product_name}</p>
                      <p className="text-gray-500 text-xs">×{o.quantity}</p>
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{o.selected_color}</td>
                    <td className="px-5 py-4 text-[#d4af37] font-medium whitespace-nowrap">
                      {o.total_price?.toLocaleString("fr-DZ")} DA
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={e => { e.stopPropagation(); setDetail(o); }}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        title="Voir les détails"
                      >
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <OrderDetailModal
          order={detail}
          onClose={() => setDetail(null)}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  );
}
