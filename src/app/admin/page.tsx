"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShoppingCart, Package, DollarSign, TrendingUp } from "lucide-react";

export default function AdminOverview() {
  const [stats, setStats] = useState({ orders: 0, revenue: 0, lowStock: 0, products: 0 });
  const [categoryStats, setCategoryStats] = useState<any[]>([]);
  const [financials, setFinancials] = useState({
    deliveredRevenue: 0,
    cogs: 0,
    adsCosts: 0,
    returnsCosts: 0,
    netProfit: 0,
    marginRate: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const [
          { count: ordersCount }, 
          { data: ordersData }, 
          { count: productsCount }, 
          { data: lowStockProducts },
          { data: financialSettings }
        ] = await Promise.all([
          supabase.from("orders").select("*", { count: "exact", head: true }),
          supabase.from("orders").select("total_price, quantity, product_id, product_name, status, delivery_fee"),
          supabase.from("products").select("*", { count: "exact", head: true }),
          supabase.from("products").select("id, name, stock_quantity").lte("stock_quantity", 5).gt("stock_quantity", 0),
          supabase.from("store_settings").select("value").eq("id", "financial_settings").single(),
        ]);

        const { data: productsData } = await supabase.from("products").select("id, name, category");

        const ordersList = ordersData || [];
        const productsList = productsData || [];

        // 1. Calculate overall revenue (excluding cancelled and returned orders)
        const revenue = ordersList
          .filter((o: any) => o.status !== "cancelled" && o.status !== "returned")
          .reduce((sum: number, o: any) => sum + (o.total_price ?? 0), 0);

        // 2. Map product_id -> category & name
        const productCategoryMap: Record<string, string> = {};
        productsList.forEach((p: any) => {
          productCategoryMap[p.id] = p.category || "Sans catalogue";
        });

        // 3. Aggregate stats by category
        const catStatsMap: Record<string, { category: string; unitsSold: number; revenue: number; ordersCount: number }> = {};

        ordersList.forEach((o: any) => {
          if (o.status === "cancelled" || o.status === "returned") return;

          let category = "Sans catalogue";
          if (o.product_id && productCategoryMap[o.product_id]) {
            category = productCategoryMap[o.product_id];
          } else if (o.product_name) {
            const p = productsList.find((x: any) => x.name === o.product_name);
            if (p?.category) {
              category = p.category;
            }
          }

          if (!catStatsMap[category]) {
            catStatsMap[category] = { category, unitsSold: 0, revenue: 0, ordersCount: 0 };
          }

          catStatsMap[category].unitsSold += Number(o.quantity || 1);
          catStatsMap[category].revenue += Number(o.total_price || 0);
          catStatsMap[category].ordersCount += 1;
        });

        const sortedStats = Object.values(catStatsMap).sort((a, b) => b.revenue - a.revenue);

        // 4. Calculate Financial KPIs (margins, COGS, Ads, returns costs)
        let adsCosts = 0;
        let returnFee = 400;
        let purchasePrices: Record<string, number> = {};
        let productAdsCosts: Record<string, number> = {};

        if (financialSettings?.value) {
          try {
            const parsed = JSON.parse(financialSettings.value);
            returnFee = Number(parsed.return_fee_per_unit || 400);
            purchasePrices = parsed.product_purchase_prices || {};
            productAdsCosts = parsed.product_ads_costs || {};
          } catch { /* ignore */ }
        }

        // Sum the ads costs of all products
        adsCosts = Object.values(productAdsCosts).reduce((sum, val) => sum + Number(val || 0), 0);

        const deliveredOrders = ordersList.filter((o: any) => o.status === "delivered");
        const returnedOrders = ordersList.filter((o: any) => o.status === "returned");

        const deliveredRevenue = deliveredOrders.reduce((sum: number, o: any) => sum + ((o.total_price ?? 0) - (o.delivery_fee ?? 0)), 0);
        
        const cogs = deliveredOrders.reduce((sum: number, o: any) => {
          const unitCost = purchasePrices[o.product_id] || 0;
          return sum + (Number(o.quantity || 1) * unitCost);
        }, 0);

        const returnsCosts = returnedOrders.length * returnFee;

        const netProfit = deliveredRevenue - cogs - adsCosts - returnsCosts;
        const marginRate = deliveredRevenue > 0 ? (netProfit / deliveredRevenue) * 100 : 0;

        setFinancials({
          deliveredRevenue,
          cogs,
          adsCosts,
          returnsCosts,
          netProfit,
          marginRate,
        });

        setCategoryStats(sortedStats);
        setStats({
          orders: ordersCount ?? 0,
          revenue,
          lowStock: lowStockProducts?.length ?? 0,
          products: productsCount ?? 0,
        });
      } catch (err) {
        console.error("Error loading admin stats:", err);
      }
    })();
  }, []);

  const cards = [
    { icon: ShoppingCart, label: "Commandes",        value: stats.orders,                          color: "text-blue-400",   bg: "bg-blue-500/10"  },
    { icon: DollarSign,   label: "Chiffre d'affaires", value: `${stats.revenue.toLocaleString("fr-DZ")} DA`, color: "text-green-400",  bg: "bg-green-500/10" },
    { icon: TrendingUp,   label: "Bénéfice Net (Profit)", value: `${financials.netProfit.toLocaleString("fr-DZ")} DA`, color: "text-[#d4af37]", bg: "bg-[#d4af37]/10" },
    { icon: Package,      label: "Stock limité",      value: stats.lowStock,                        color: "text-amber-400",  bg: "bg-amber-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-heading font-bold text-white">Vue d&apos;ensemble</h2>
        <p className="text-gray-500 text-sm mt-1">Résumé en temps réel de votre boutique.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        {cards.map(({ icon: Icon, label, value, color, bg }) => (
          <div
            key={label}
            className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-4 hover:border-white/10 transition-colors"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
              <p className="text-2xl font-bold text-white mt-1">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Grid of recent orders and catalogue stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RecentOrders />
        </div>
        <div className="space-y-6">
          <FinancialReport financials={financials} />
          <CatalogueStats stats={categoryStats} />
        </div>
      </div>
    </div>
  );
}

function RecentOrders() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setOrders(data ?? []));
  }, []);

  const STATUS_STYLES: Record<string, string> = {
    pending:    "bg-amber-500/20 text-amber-400",
    processing: "bg-blue-500/20 text-blue-400",
    delivered:  "bg-green-500/20 text-green-400",
    cancelled:  "bg-red-500/20 text-red-400",
  };

  return (
    <div className="bg-[#0f2847] border border-white/5 rounded-2xl overflow-hidden">
      <div className="p-6 border-b border-white/5">
        <h3 className="font-semibold text-white">Dernières commandes</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              {["Client","Wilaya","Produit","Total","Statut"].map((h) => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-600">
                  Aucune commande pour l&apos;instant
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="hover:bg-white/2 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">
                    {o.customer_prenom} {o.customer_nom}
                  </td>
                  <td className="px-6 py-4 text-gray-400">{o.customer_wilaya}</td>
                  <td className="px-6 py-4 text-gray-400">{o.product_name}</td>
                  <td className="px-6 py-4 text-[#d4af37] font-medium">
                    {o.total_price?.toLocaleString("fr-DZ")} DA
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[o.status] ?? ""}`}>
                      {o.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CatalogueStats({ stats }: { stats: any[] }) {
  const maxRevenue = stats.reduce((max, s) => Math.max(max, s.revenue), 0) || 1;

  return (
    <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-white text-lg">Performance par Catalogue</h3>
        <p className="text-gray-500 text-xs mt-1">Analyse des ventes, chiffre d&apos;affaires et unités vendues par catalogue (catégorie).</p>
      </div>

      <div className="space-y-5">
        {stats.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-6">Aucune donnée de vente disponible.</p>
        ) : (
          stats.map((s) => {
            const pct = Math.min(100, Math.round((s.revenue / maxRevenue) * 100));
            return (
              <div key={s.category} className="space-y-2 group">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white group-hover:text-[#d4af37] transition-colors">
                      {s.category}
                    </span>
                    <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                      {s.ordersCount} cmd{s.ordersCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-[#d4af37]">{s.revenue.toLocaleString("fr-DZ")} DA</span>
                    <span className="text-xs text-gray-500 block">{s.unitsSold} unité{s.unitsSold > 1 ? 's' : ''} vendue{s.unitsSold > 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Progress bar container */}
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-violet-500 to-[#d4af37] rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FinancialReport({ financials }: { financials: any }) {
  const { deliveredRevenue, cogs, adsCosts, returnsCosts, netProfit, marginRate } = financials;
  
  const items = [
    { label: "Ventes Livrées (CA)", value: `${deliveredRevenue.toLocaleString("fr-DZ")} DA`, color: "text-green-400", prefix: "+" },
    { label: "Coût d'Achat (COGS)",  value: `${cogs.toLocaleString("fr-DZ")} DA`,             color: "text-red-400",   prefix: "-" },
    { label: "Publicité (Social Ads)", value: `${adsCosts.toLocaleString("fr-DZ")} DA`,         color: "text-red-400",   prefix: "-" },
    { label: "Coût des Retours",     value: `${returnsCosts.toLocaleString("fr-DZ")} DA`,     color: "text-red-400",   prefix: "-" },
  ];

  return (
    <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-white text-lg">Rapport Financier &amp; Marges</h3>
        <p className="text-gray-500 text-xs mt-1">Calcul en temps réel basé sur les commandes livrées et vos paramètres.</p>
      </div>

      {/* Hero Margin indicator */}
      <div className="bg-black/20 border border-white/5 rounded-xl p-4 flex justify-between items-center">
        <div>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest block">Bénéfice Net</span>
          <span className={`text-xl font-bold ${netProfit >= 0 ? 'text-[#d4af37]' : 'text-red-400'}`}>
            {netProfit.toLocaleString("fr-DZ")} DA
          </span>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-gray-500 uppercase tracking-widest block">Taux de Marge</span>
          <span className={`text-sm font-bold bg-white/5 px-2.5 py-1 rounded-full ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {marginRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Details list */}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between items-center text-xs border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
            <span className="text-gray-400">{item.label}</span>
            <span className={`font-semibold ${item.color}`}>
              {item.prefix} {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
