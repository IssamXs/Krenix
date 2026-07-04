"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Package, ShoppingCart, LogOut, Menu, X, Gem, Settings, MessageSquare
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

const NAV = [
  { href: "/admin",            icon: LayoutDashboard, label: "Vue d'ensemble" },
  { href: "/admin/inventory",  icon: Package,          label: "Inventaire"     },
  { href: "/admin/orders",     icon: ShoppingCart,     label: "Commandes"      },
  { href: "/admin/messages",   icon: MessageSquare,    label: "Messages"       },
  { href: "/admin/settings",   icon: Settings,         label: "Paramètres"     },
];

function LoginScreen() {
  const router = useRouter();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError("Identifiants incorrects."); setLoading(false); return; }
    router.refresh();
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#061121] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Gem className="mx-auto text-[#d4af37] mb-3" size={40} />
          <h1 className="font-heading text-3xl font-bold text-white">Le Mirage</h1>
          <p className="text-gray-400 text-sm mt-1">Espace Administration</p>
        </div>
        <form
          onSubmit={handleLogin}
          className="bg-[#0f2847] border border-white/10 rounded-2xl p-8 space-y-5 shadow-2xl"
        >
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Adresse e-mail</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors"
              placeholder="admin@lemirage.dz"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mot de passe</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-gold w-full py-3.5">
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [user, setUser]         = useState<User | null | undefined>(undefined); // undefined = loading
  const [sideOpen, setSideOpen] = useState(false);

  // Real-time notification and badges states
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [toasts, setToasts] = useState<{ id: string; type: "order" | "message"; title: string; message: string }[]>([]);

  const addToast = (type: "order" | "message", title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchCounts = async () => {
    try {
      const [{ count: oCount }, { count: mCount }, { data: stockData }] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("is_read", false),
        supabase.from("products").select("id, name, stock_quantity").lte("stock_quantity", 5),
      ]);
      setPendingOrdersCount(oCount ?? 0);
      setUnreadMessagesCount(mCount ?? 0);
      setLowStockProducts(stockData ?? []);
    } catch (err) {
      console.error("Error fetching counts:", err);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Real-time Subscriptions Setup
  useEffect(() => {
    if (!user) return;
    
    fetchCounts();

    const ordersChannel = supabase
      .channel("admin-orders-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          fetchCounts();
          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as any;
            addToast(
              "order",
              "🛒 Nouvelle Commande !",
              `${newOrder.customer_prenom} ${newOrder.customer_nom} (${newOrder.customer_wilaya}) a commandé ${newOrder.product_name}`
            );
          }
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel("admin-messages-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contact_messages" },
        (payload) => {
          fetchCounts();
          if (payload.eventType === "INSERT") {
            const newMsg = payload.new as any;
            addToast(
              "message",
              "💬 Nouveau Message !",
              `${newMsg.customer_name} : "${newMsg.message.substring(0, 60)}..."`
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, [user]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/admin");
  }, [router]);

  // Loading
  if (user === undefined)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#061121]">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  // Not authenticated
  if (user === null) return <LoginScreen />;

  // Authenticated
  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside
      className={`${
        mobile
          ? "fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 " +
            (sideOpen ? "translate-x-0" : "-translate-x-full")
          : "hidden lg:flex w-64 flex-col flex-shrink-0"
      } bg-[#0f2847] border-r border-white/5 flex flex-col`}
    >
      <div className="h-16 flex items-center px-6 border-b border-white/5">
        <Gem size={20} className="text-[#d4af37] mr-2" />
        <span className="font-heading text-lg font-bold text-white tracking-wider">
          Le Mirage
        </span>
        {mobile && (
          <button onClick={() => setSideOpen(false)} className="ml-auto text-gray-500">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          const isOrders = href === "/admin/orders";
          const isMessages = href === "/admin/messages";
          const count = isOrders ? pendingOrdersCount : isMessages ? unreadMessagesCount : 0;

          return (
            <Link
              key={href} href={href}
              onClick={() => setSideOpen(false)}
              className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-[#d4af37]/15 text-[#d4af37]"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} />
                <span>{label}</span>
              </div>
              {count > 0 && (
                <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-bold text-black bg-[#d4af37] rounded-full shadow-md animate-pulse">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/5">
        <p className="px-4 py-2 text-xs text-gray-600 truncate">{user.email}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={18} />
          Déconnexion
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-[#0f0f0f] overflow-hidden">
      <Sidebar />
      {sideOpen && (
        <>
          <Sidebar mobile />
          <div
            className="fixed inset-0 z-40 bg-black/60 lg:hidden"
            onClick={() => setSideOpen(false)}
          />
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 flex items-center px-6 border-b border-white/5 bg-[#0f2847] flex-shrink-0">
          <button
            className="lg:hidden text-gray-400 mr-4"
            onClick={() => setSideOpen(true)}
          >
            <Menu size={22} />
          </button>
          <h1 className="text-white font-semibold text-sm">
            {NAV.find((n) => n.href === pathname)?.label ?? "Administration"}
          </h1>
        </header>

        {lowStockProducts.length > 0 && (
          <div className="bg-red-500/20 border-b border-red-500/30 px-6 py-3 flex items-center gap-3 text-red-200">
            <Package size={18} className="text-red-400 flex-shrink-0" />
            <div className="text-sm font-medium">
              <span className="font-bold text-red-400">Alerte Stock :</span>{" "}
              {lowStockProducts.length === 1 
                ? `Le produit "${lowStockProducts[0].name}" est presque épuisé (${lowStockProducts[0].stock_quantity} restants).`
                : `${lowStockProducts.length} produits ont un stock critique (≤ 5).`
              }
              <Link href="/admin/inventory" className="ml-3 underline hover:text-white">
                Gérer l'inventaire
              </Link>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-auto p-4 md:p-6 text-white">
          {children}
        </main>
      </div>

      {/* Real-time Toasts Container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-4 bg-[#0f2847] border shadow-2xl rounded-2xl transition-all duration-300 transform scale-100 animate-in slide-in-from-bottom-5 ${
              t.type === "order" ? "border-[#d4af37]/60" : "border-blue-500/60"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm flex items-center gap-1.5">{t.title}</p>
              <p className="text-gray-300 text-xs mt-1 leading-relaxed">{t.message}</p>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-gray-500 hover:text-white transition-colors flex-shrink-0 ml-1"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
