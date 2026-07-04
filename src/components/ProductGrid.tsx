"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, ShoppingBag, Package } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import { DEMO_PRODUCTS } from "@/lib/demo-data";

/* ─── Fallback demo data ─────────────────────────────────────────────────── */


const COLOR_DOT: Record<string, string> = {
  "Emeraude":    "#50c878",
  "Bordeaux":    "#7b1f2e",
  "Crème":       "#fffdd0",
  "Gris Perle":  "#c8c8c8",
  "Beige Sable": "#d4b896",
  "Chocolat":    "#5c3317",
  "Anthracite":  "#3b3b3b",
  "Blanc Neige": "#f0f0f0",
  "Ivoire":      "#fffff0",
  "Doré":        "#d4af37",
  "Turquoise":   "#40e0d0",
  "Corail":      "#ff6b6b",
  "Prune":       "#701c40",
  "Lin Naturel": "#c8a97e",
  "Blanc Cassé": "#f5f0e8",
  "Taupe":       "#8e7966",
  "Gris Ciment": "#8a9399",
  "Bleu Nuit":   "#1a2b4b",
  "Terracotta":  "#c06a4c",
};

function StockBadge({ qty }: { qty: number }) {
  if (qty === 0)
    return (
      <span className="inline-flex items-center gap-1 bg-red-500/90 text-white px-3 py-1 rounded-full text-xs font-semibold">
        <AlertCircle size={13} /> Épuisé
      </span>
    );
  if (qty <= 5)
    return (
      <span className="inline-flex items-center gap-1 bg-amber-500/90 text-white px-3 py-1 rounded-full text-xs font-semibold">
        <Package size={13} /> Stock limité ({qty})
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-semibold">
      <CheckCircle2 size={13} /> En Stock
    </span>
  );
}

export function ProductGrid() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false });
        setProducts(data && !error && data.length > 0 ? (data as Product[]) : DEMO_PRODUCTS);
      } catch {
        setProducts(DEMO_PRODUCTS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <section id="catalogue" className="py-28 text-center text-gray-400 bg-[#f9f6f0]">
        Chargement du catalogue…
      </section>
    );
  }

  return (
    <section id="catalogue" className="bg-[#f9f6f0] py-16 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-10 md:mb-16">
          <span className="text-xs font-semibold tracking-widest uppercase text-[#d4af37] mb-3 block">
            Notre Atelier
          </span>
          <h2 className="font-heading text-3xl md:text-4xl lg:text-5xl font-bold text-[#0f2847] mb-4">
            Catalogue
          </h2>
          <p className="text-gray-500 max-w-xl mx-auto leading-relaxed text-sm md:text-base">
            Chaque pièce est confectionnée avec soin dans notre atelier. Commandez directement, livré chez vous.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product, i) => {
            const primaryImage = product.variants?.[0]?.image_url || product.image_url || undefined;
            const hoverImage = product.hover_image_url || product.variants?.[1]?.image_url || undefined;

            return (
            <motion.article
              key={product.id}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl border border-[#ede9e0] transition-all duration-300 flex flex-col"
            >
              {/* ── Image with hover swap ── */}
              <Link href={`/product/${product.id}`} className="relative h-52 sm:h-64 overflow-hidden bg-[#f0ebe0] block">
                {/* Primary image */}
                <img
                  src={primaryImage}
                  alt={product.name}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-in-out opacity-100 ${hoverImage ? 'group-hover:opacity-0' : ''}`}
                />
                {/* Hover image */}
                {hoverImage && (
                  <img
                    src={hoverImage}
                    alt={`${product.name} – vue alternative`}
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ease-in-out opacity-0 group-hover:opacity-100"
                  />
                )}
                {/* Overlay on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />

                {/* Badges */}
                <div className="absolute top-3 left-3">
                  <StockBadge qty={product.stock_quantity} />
                </div>
                <div className="absolute top-3 right-3 bg-[#0f2847]/80 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                  {product.category}
                </div>
              </Link>

              {/* ── Content ── */}
              <Link href={`/product/${product.id}`} className="p-6 flex flex-col flex-grow group-hover:bg-white/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-heading text-lg font-semibold text-[#0f2847] leading-tight group-hover:text-[#d4af37] transition-colors">
                    {product.name}
                  </h3>
                  <span className="text-[#d4af37] font-bold text-lg whitespace-nowrap ml-2">
                    {product.price.toLocaleString("fr-DZ")} DA
                  </span>
                </div>

                {/* Colors */}
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Couleurs disponibles
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.colors.map((c) => (
                      <span
                        key={c}
                        className="flex items-center gap-1.5 text-xs bg-[#f9f6f0] border border-[#ede9e0] px-2 py-1 rounded-full text-gray-600"
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border border-white shadow-sm flex-shrink-0"
                          style={{ background: COLOR_DOT[c] ?? "#ccc" }}
                        />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div className={`mt-auto w-full py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                  product.stock_quantity === 0 
                    ? "bg-gray-100 text-gray-400" 
                    : "bg-[#fdfaf4] text-[#d4af37] border border-[#d4af37]/30 group-hover:bg-[#d4af37] group-hover:text-white"
                }`}>
                  <ShoppingBag size={17} />
                  {product.stock_quantity === 0 ? "Épuisé" : "Découvrir"}
                </div>
              </Link>
            </motion.article>
          )})}
        </div>
      </div>
    </section>
  );
}
