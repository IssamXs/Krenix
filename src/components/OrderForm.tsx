"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, ShoppingBag, Loader2, Truck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";
import { WILAYAS } from "@/lib/wilayas";
import { getDeliveryFee } from "@/lib/delivery";

interface Props {
  product: Product | null;
  onColorSelect?: (color: string) => void;
}

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

export function OrderForm({ product, onColorSelect }: Props) {
  const [selectedColor, setSelectedColor] = useState(product?.colors[0] ?? "");
  const [quantity, setQuantity]           = useState(1);
  const [submitting, setSubmitting]       = useState(false);
  const [success, setSuccess]             = useState(false);
  const [form, setForm] = useState({
    nom: "", prenom: "", phone: "", wilaya: "", commune: "",
  });

  useEffect(() => {
    if (product?.colors[0] && !selectedColor) {
      setSelectedColor(product.colors[0]);
    }
  }, [product, selectedColor]);

  if (!product) return null;

  const deliveryFee   = getDeliveryFee(form.wilaya);
  const subtotal      = product.price * quantity;
  const total         = subtotal + (form.wilaya ? deliveryFee : 0);

  const selectedVariant = product.variants?.find(v => v.color === selectedColor);
  const maxStock = selectedVariant ? Number(selectedVariant.quantity) : product.stock_quantity;

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleColorChange = (c: string) => {
    setSelectedColor(c);
    if (onColorSelect) onColorSelect(c);
    
    // Ensure quantity doesn't exceed new color's stock
    const variant = product.variants?.find(v => v.color === c);
    const newMaxStock = variant ? Number(variant.quantity) : product.stock_quantity;
    if (quantity > newMaxStock) {
      setQuantity(newMaxStock > 0 ? newMaxStock : 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (maxStock === 0) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("orders").insert({
        product_id:       product.id,
        product_name:     product.name,
        customer_nom:     form.nom,
        customer_prenom:  form.prenom,
        customer_phone:   form.phone,
        customer_wilaya:  form.wilaya,
        customer_commune: form.commune,
        selected_color:   selectedColor,
        quantity,
        delivery_fee:     deliveryFee,
        total_price:      total,
        status:           "pending",
      });
      
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      console.error("Order insertion error:", err);
      alert("Erreur lors de la validation de la commande : " + (err.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white w-full rounded-2xl shadow-xl overflow-hidden border border-[#ede9e0]">
          {success ? (
            /* ── Success ── */
            <div className="p-8 flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", bounce: 0.55 }}
                className="text-green-500 mb-4"
              >
                <CheckCircle size={72} strokeWidth={1.5} />
              </motion.div>
              <h3 className="font-heading text-2xl font-bold mb-2 text-[#0f2847]">
                Commande Confirmée !
              </h3>
              <p className="text-gray-500 mb-2 leading-relaxed">
                Merci <strong>{form.prenom} {form.nom}</strong> ! Votre commande est bien enregistrée.
              </p>
              <p className="text-gray-400 text-sm mb-8">
                Notre équipe vous contactera au <strong>{form.phone}</strong> pour organiser la livraison à{" "}
                <strong>{form.commune}, {form.wilaya}</strong>.
              </p>
              <a href="/" className="btn-gold w-full max-w-xs mt-4">
                Continuer les achats
              </a>
            </div>
          ) : (
            /* ── Form ── */
            <div className="p-6 sm:p-8">
              {/* Product summary */}
              <div className="flex gap-4 mb-6 pb-6 border-b border-gray-100">
                <img
                  src={selectedVariant?.image_urls?.[0] || selectedVariant?.image_url || product.image_url || undefined}
                  alt={product.name}
                  className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-heading font-semibold text-[#0f2847] text-base leading-tight mb-1">
                    {product.name}
                  </h3>
                  <p className="text-[#d4af37] font-bold">
                    {product.price.toLocaleString("fr-DZ")} DA / unité
                  </p>
                </div>
              </div>

              {/* Color selection */}
              <div className="mb-5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Couleur choisie
                </label>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((c) => {
                    const v = product.variants?.find(variant => variant.color === c);
                    const isOutOfStock = v ? v.quantity === 0 : false;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleColorChange(c)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                          selectedColor === c
                            ? "border-[#d4af37] text-[#0f2847] bg-[#fdf8ea] shadow-sm"
                            : "border-gray-200 text-gray-500 hover:border-gray-400"
                        } ${isOutOfStock ? "opacity-50 line-through" : ""}`}
                      >
                        <span
                          className="inline-block w-3 h-3 rounded-full border border-white shadow"
                          style={{ background: COLOR_DOT[c] ?? "#ccc" }}
                        />
                        {c}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Quantity */}
              <div className="mb-6">
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Quantité
                  </label>
                  {maxStock > 0 ? (
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                      {maxStock} en stock
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                      Épuisé
                    </span>
                  )}
                </div>
                <div className="inline-flex items-center border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={maxStock === 0}
                    className="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >−</button>
                  <span className="w-12 text-center font-semibold">{maxStock === 0 ? 0 : quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                    disabled={maxStock === 0 || quantity >= maxStock}
                    className="w-10 h-10 flex items-center justify-center text-lg font-bold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >+</button>
                </div>
              </div>

              {/* Form fields */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                    <input
                      required value={form.nom} onChange={set("nom")}
                      placeholder="Dupont"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                    <input
                      required value={form.prenom} onChange={set("prenom")}
                      placeholder="Amira"
                      className="input-field"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Numéro de téléphone
                  </label>
                  <input
                    required type="tel" value={form.phone} onChange={set("phone")}
                    placeholder="0555 XX XX XX"
                    className="input-field"
                  />
                </div>

                {/* Wilaya — triggers delivery fee update */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wilaya</label>
                  <select required value={form.wilaya} onChange={set("wilaya")} className="input-field">
                    <option value="">Sélectionner votre wilaya</option>
                    {WILAYAS.map((w) => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commune</label>
                  <input
                    required value={form.commune} onChange={set("commune")}
                    placeholder="Votre commune"
                    className="input-field"
                  />
                </div>

                {/* Price breakdown */}
                <div className="bg-[#f9f6f0] rounded-xl p-4 space-y-2 border border-[#ede9e0]">
                  <div className="flex justify-between text-xs sm:text-sm text-gray-600">
                    <span className="mr-2">Sous-total ({quantity} × {product.price.toLocaleString("fr-DZ")} DA)</span>
                    <span className="font-medium whitespace-nowrap">{subtotal.toLocaleString("fr-DZ")} DA</span>
                  </div>

                  <div className="flex justify-between text-xs sm:text-sm text-gray-600">
                    <span className="flex items-center gap-1.5">
                      <Truck size={14} className="text-[#d4af37]" />
                      Livraison à domicile
                      {form.wilaya && (
                        <span className="text-xs text-gray-400">({form.wilaya})</span>
                      )}
                    </span>
                    <motion.span
                      key={deliveryFee}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="font-medium"
                    >
                      {form.wilaya
                        ? `${deliveryFee.toLocaleString("fr-DZ")} DA`
                        : "— choisir wilaya"}
                    </motion.span>
                  </div>

                  <div className="border-t border-[#ede9e0] pt-2 flex justify-between items-center">
                    <span className="font-semibold text-[#0f2847]">Total</span>
                    <motion.span
                      key={total}
                      initial={{ scale: 1.1, color: "#d4af37" }}
                      animate={{ scale: 1, color: "#0f2847" }}
                      transition={{ duration: 0.3 }}
                      className="text-2xl font-bold font-heading"
                    >
                      {total.toLocaleString("fr-DZ")} DA
                    </motion.span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || !form.wilaya || maxStock === 0}
                  className="btn-gold w-full py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      <ShoppingBag size={20} />
                      {maxStock === 0 ? "Épuisé" : "Commander Maintenant"}
                    </>
                  )}
                </button>

                {!form.wilaya && maxStock > 0 && (
                  <p className="text-center text-xs text-gray-400">
                    Choisissez votre wilaya pour voir le prix total de livraison
                  </p>
                )}
              </form>
            </div>
          )}
    </div>
  );
}
