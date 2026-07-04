"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Product, ProductVariant } from "@/types";
import { Plus, Pencil, Trash2, X, Loader2, Upload } from "lucide-react";

const EMPTY_FORM = {
  name: "", description: "", price: "", category: "", colors: "", stock_quantity: "", image_url: "", variants: [] as ProductVariant[],
};

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState<"add" | "edit" | null>(null);
  const [editing, setEditing]   = useState<Product | null>(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [variantUploading, setVariantUploading] = useState<number | null>(null);
  
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchProducts = async () => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModal("add");
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name:           p.name,
      description:    p.description,
      price:          String(p.price),
      category:       p.category,
      colors:         p.colors?.join(", ") ?? "",
      stock_quantity: String(p.stock_quantity),
      image_url:      p.image_url,
      variants:       p.variants || [],
    });
    setModal("edit");
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `products/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { data, error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) {
      alert("Erreur lors de l'envoi de l'image (Vérifiez les permissions Supabase) : " + error.message);
    } else if (data) {
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(data.path);
      setForm((f) => ({ ...f, image_url: urlData.publicUrl }));
    }
    setUploading(false);
  };
  const handleVariantImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setVariantUploading(index);
    const path = `products/variants/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const { data, error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) {
      alert("Erreur lors de l'envoi de l'image de la variante : " + error.message);
    } else if (data) {
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(data.path);
      setForm((f) => {
        const newVariants = [...f.variants];
        const currentUrls = newVariants[index].image_urls || (newVariants[index].image_url ? [newVariants[index].image_url] : []);
        const newUrls = [...currentUrls, urlData.publicUrl];
        newVariants[index].image_urls = newUrls;
        newVariants[index].image_url = newUrls[0] || "";
        return { ...f, variants: newVariants };
      });
    }
    setVariantUploading(null);
  };

  const removeVariantImage = (variantIndex: number, imgIndex: number) => {
    setForm((f) => {
      const newVariants = [...f.variants];
      const currentUrls = newVariants[variantIndex].image_urls || (newVariants[variantIndex].image_url ? [newVariants[variantIndex].image_url] : []);
      const newUrls = currentUrls.filter((_, idx) => idx !== imgIndex);
      newVariants[variantIndex].image_urls = newUrls;
      newVariants[variantIndex].image_url = newUrls[0] || "";
      return { ...f, variants: newVariants };
    });
  };

  const addVariant = () => {
    setForm(f => ({ ...f, variants: [...f.variants, { color: "", quantity: 0, image_url: "", image_urls: [] }] }));
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: string | number) => {
    setForm(f => {
      const newVariants = [...f.variants];
      newVariants[index] = { ...newVariants[index], [field]: value } as any;
      return { ...f, variants: newVariants };
    });
  };

  const removeVariant = (index: number) => {
    setForm(f => {
      const newVariants = [...f.variants];
      newVariants.splice(index, 1);
      return { ...f, variants: newVariants };
    });
  };
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    // Auto-calculate colors and total stock if variants exist
    const finalColors = form.variants.length > 0 
      ? form.variants.map(v => v.color).filter(Boolean)
      : form.colors.split(",").map((s) => s.trim()).filter(Boolean);
      
    const finalStock = form.variants.length > 0 
      ? form.variants.reduce((acc, v) => acc + Number(v.quantity || 0), 0)
      : Number(form.stock_quantity);

    const derivedImageUrl = form.variants.length > 0 && form.variants[0].image_url 
      ? form.variants[0].image_url 
      : form.image_url;

    const payload = {
      name:           form.name,
      description:    form.description,
      price:          Number(form.price),
      category:       form.category,
      colors:         finalColors,
      stock_quantity: finalStock,
      image_url:      derivedImageUrl,
      variants:       form.variants,
    };
    if (modal === "add") {
      await supabase.from("products").insert(payload);
    } else if (editing) {
      await supabase.from("products").update(payload).eq("id", editing.id);
    }
    setSaving(false);
    setModal(null);
    fetchProducts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    await supabase.from("products").delete().eq("id", id);
    fetchProducts();
  };

  const set = (k: keyof typeof EMPTY_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const STOCK_STATUS = (qty: number) =>
    qty === 0
      ? { label: "Épuisé",        cls: "bg-red-500/20 text-red-400"   }
      : qty <= 5
      ? { label: "Stock limité",  cls: "bg-amber-500/20 text-amber-400" }
      : { label: "En Stock",      cls: "bg-green-500/20 text-green-400" };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-heading font-bold text-white">Inventaire</h2>
          <p className="text-gray-500 text-sm mt-1">Gérez vos produits, couleurs et niveaux de stock.</p>
        </div>
        <button onClick={openAdd} className="btn-gold">
          <Plus size={18} /> Ajouter un produit
        </button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-500">Chargement…</div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-600 bg-[#0f2847] rounded-2xl border border-white/5">
          Aucun produit. Commencez par en ajouter un.
        </div>
      ) : (
        <div className="bg-[#0f2847] border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {["Produit","Catégorie","Prix","Couleurs","Stock","Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {products.map((p) => {
                const { label, cls } = STOCK_STATUS(p.stock_quantity);
                return (
                  <tr key={p.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {p.variants && p.variants[0]?.image_url ? (
                          <img src={p.variants[0].image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-white/5" />
                        ) : p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded-lg object-cover bg-white/5" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-white/5" />
                        )}
                        <span className="text-white font-medium">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-400">{p.category}</td>
                    <td className="px-5 py-4 text-[#d4af37] font-medium">
                      {p.price.toLocaleString("fr-DZ")} DA
                    </td>
                    <td className="px-5 py-4 text-gray-400 text-xs">{p.colors?.join(", ") || "-"}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${cls}`}>
                          {label} ({p.stock_quantity})
                        </span>
                        {p.variants && p.variants.length > 0 && (
                          <span className="text-xs text-gray-500">{p.variants.length} variantes</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0f2847] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-white/5 sticky top-0 bg-[#0f2847] z-10">
              <h3 className="text-white font-semibold text-lg">
                {modal === "add" ? "Nouveau produit" : "Modifier le produit"}
              </h3>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6">
              
              {/* Informations Générales */}
              <div className="space-y-4">
                <h4 className="text-[#d4af37] text-sm font-semibold uppercase tracking-widest border-b border-white/5 pb-2">Informations Générales</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Nom du produit</label>
                    <input required value={form.name} onChange={set("name")} placeholder="Ex: Cache Rideau Velours" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Catégorie</label>
                    <input required value={form.category} onChange={set("category")} placeholder="Ex: Cache Rideaux" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Prix (DA)</label>
                  <input required type="number" value={form.price} onChange={set("price")} placeholder="3200" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors" />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Description</label>
                  <textarea 
                    required value={form.description} onChange={set("description")} 
                    placeholder="Description détaillée du produit..." 
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors resize-y" 
                  />
                </div>
              </div>

              {/* Variantes et Stock */}
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/5 pb-2">
                  <h4 className="text-[#d4af37] text-sm font-semibold uppercase tracking-widest">Variantes de Couleurs</h4>
                  <button type="button" onClick={addVariant} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1">
                    <Plus size={14} /> Ajouter une variante
                  </button>
                </div>
                
                {form.variants.length === 0 ? (
                  <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="text-sm text-gray-400">Si vous n'utilisez pas de variantes, remplissez ceci :</p>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Couleurs (séparées par virgule)</label>
                      <input value={form.colors} onChange={set("colors")} placeholder="Emeraude, Bordeaux, Crème" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Quantité totale en stock</label>
                      <input type="number" value={form.stock_quantity} onChange={set("stock_quantity")} placeholder="20" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#d4af37] transition-colors" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.variants.map((variant, index) => (
                      <div key={index} className="flex flex-col sm:flex-row gap-3 bg-white/5 p-3 rounded-xl border border-white/10 relative">
                        <button type="button" onClick={() => removeVariant(index)} className="absolute top-2 right-2 text-gray-500 hover:text-red-400">
                          <X size={16} />
                        </button>
                        
                        {/* Images de la variante */}
                        <div className="flex flex-col gap-2 w-full sm:w-44 border-r border-white/10 pr-0 sm:pr-3">
                          <label className="block text-[10px] text-gray-400 uppercase">Photos de la variante</label>
                          <div className="flex flex-wrap gap-1.5 items-center">
                            {(variant.image_urls || (variant.image_url ? [variant.image_url] : [])).map((img, imgIdx) => (
                              <div key={imgIdx} className="relative w-12 h-12 rounded bg-black/20 overflow-hidden border border-white/10 group/img">
                                <img src={img} alt="Aperçu" className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => removeVariantImage(index, imgIdx)}
                                  className="absolute inset-0 bg-red-600/80 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                                >
                                  <Trash2 size={12} className="text-white" />
                                </button>
                              </div>
                            ))}

                            <label className="w-12 h-12 rounded border border-dashed border-white/20 hover:border-[#d4af37] flex flex-col items-center justify-center cursor-pointer bg-white/5 hover:bg-white/10 transition-colors">
                              {variantUploading === index ? (
                                <Loader2 size={14} className="animate-spin text-gray-400" />
                              ) : (
                                <Plus size={14} className="text-gray-400 hover:text-white" />
                              )}
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => handleVariantImageUpload(index, e)} 
                                disabled={variantUploading !== null} 
                              />
                            </label>
                          </div>
                        </div>

                        {/* Infos de la variante */}
                        <div className="flex-1 grid grid-cols-2 gap-3 mt-3 sm:mt-0">
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1 uppercase">Couleur</label>
                            <input required value={variant.color} onChange={(e) => updateVariant(index, "color", e.target.value)} placeholder="Nom de la couleur" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-[#d4af37]" />
                          </div>
                          <div>
                            <label className="block text-[10px] text-gray-400 mb-1 uppercase">Quantité</label>
                            <input required type="number" min="0" value={variant.quantity} onChange={(e) => updateVariant(index, "quantity", Number(e.target.value))} placeholder="Stock" className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-[#d4af37]" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" disabled={saving} className="btn-gold w-full py-4 mt-4 font-bold text-base shadow-lg shadow-[#d4af37]/20">
                {saving ? <Loader2 size={20} className="animate-spin mx-auto" /> : modal === "add" ? "Créer le produit" : "Enregistrer les modifications"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
