"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Loader2, Upload, Save, Check, Plus, Trash2, Move,
  Phone, Mail, MapPin, Globe, Truck, Eye, EyeOff, CheckCircle2,
  Image as ImageIcon, Info, DollarSign, Package,
} from "lucide-react";
import { HeroOverlay } from "@/components/Hero";

// ── tiny uid helper ──────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_OVERLAY: Omit<HeroOverlay, "id"> = {
  text: "Nouveau texte",
  x: 50,
  y: 50,
  fontSize: 36,
  color: "#ffffff",
  bold: false,
  align: "center",
};

type Tab = "hero" | "contact" | "wecan" | "finance";

// ── Contact info shape ────────────────────────────────────────────────────────
interface ContactInfo {
  phone: string;
  phone2: string;
  whatsapp: string;
  email: string;
  address: string;
  instagram: string;
  facebook: string;
  tiktok: string;
}

const EMPTY_CONTACT: ContactInfo = {
  phone: "",
  phone2: "",
  whatsapp: "",
  email: "",
  address: "",
  instagram: "",
  facebook: "",
  tiktok: "",
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("hero");

  // ── Hero state ────────────────────────────────────────────────────────────
  const [heroImage, setHeroImage] = useState("");
  const [overlays, setOverlays] = useState<HeroOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const draggingId = useRef<string | null>(null);

  // ── Contact state ─────────────────────────────────────────────────────────
  const [contact, setContact] = useState<ContactInfo>(EMPTY_CONTACT);

  // ── WECAN state ───────────────────────────────────────────────────────────
  const [wecanToken, setWecanToken]   = useState("");
  const [wecanStoreId, setWecanStoreId] = useState("");
  const [showToken, setShowToken]     = useState(false);
  const [wecanStatus, setWecanStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [wecanTestMsg, setWecanTestMsg] = useState("");
  // ── Finance state ──────────────────────────────────────────────────────────
  const [adsCosts, setAdsCosts] = useState<Record<string, number>>({});
  const [returnFee, setReturnFee] = useState<string>("400");
  const [purchasePrices, setPurchasePrices] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<any[]>([]);

  // ── Shared state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  // ── fetch ────────────────────────────────────────────────────────────────
  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [
        { data: imgData }, 
        { data: ovData }, 
        { data: contactData }, 
        { data: wecanTokenData }, 
        { data: wecanStoreData },
        { data: finData },
        { data: prodsData }
      ] = await Promise.all([
        supabase.from("store_settings").select("value").eq("id", "hero_image").single(),
        supabase.from("store_settings").select("value").eq("id", "hero_overlays").single(),
        supabase.from("store_settings").select("value").eq("id", "contact_info").single(),
        supabase.from("store_settings").select("value").eq("id", "wecan_api_token").single(),
        supabase.from("store_settings").select("value").eq("id", "wecan_store_id").single(),
        supabase.from("store_settings").select("value").eq("id", "financial_settings").single(),
        supabase.from("products").select("id, name, category").order("created_at", { ascending: false }),
      ]);
      if (imgData) setHeroImage(imgData.value ?? "");
      if (ovData?.value) {
        try { setOverlays(JSON.parse(ovData.value)); } catch { /* ignore */ }
      }
      if (contactData?.value) {
        try { setContact({ ...EMPTY_CONTACT, ...JSON.parse(contactData.value) }); } catch { /* ignore */ }
      }
      if (wecanTokenData?.value) setWecanToken(wecanTokenData.value);
      if (wecanStoreData?.value)  setWecanStoreId(wecanStoreData.value);
      if (prodsData) setProducts(prodsData);
      if (finData?.value) {
        try {
          const parsed = JSON.parse(finData.value);
          setReturnFee(String(parsed.return_fee_per_unit || 400));
          setPurchasePrices(parsed.product_purchase_prices || {});
          setAdsCosts(parsed.product_ads_costs || {});
        } catch { /* ignore */ }
      }    } catch (err) {
      console.log("Settings table might not exist yet.", err);
    } finally {
      setLoading(false);
    }
  };

  // ── image upload ─────────────────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `settings/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const { data, error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) {
      alert("Erreur d'upload : " + error.message);
    } else if (data) {
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(data.path);
      setHeroImage(urlData.publicUrl);
    }
    setUploading(false);
  };

  // ── save ─────────────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSaving(true);
    setSaved(false);
    try {
      if (activeTab === "hero") {
        const [r1, r2] = await Promise.all([
          supabase.from("store_settings").upsert({ id: "hero_image", value: heroImage }),
          supabase.from("store_settings").upsert({ id: "hero_overlays", value: JSON.stringify(overlays) }),
        ]);
        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;
      } else if (activeTab === "contact") {
        const { error } = await supabase
          .from("store_settings")
          .upsert({ id: "contact_info", value: JSON.stringify(contact) });
        if (error) throw error;
      } else if (activeTab === "wecan") {
        const [r1, r2] = await Promise.all([
          supabase.from("store_settings").upsert({ id: "wecan_api_token", value: wecanToken.trim() }),
          supabase.from("store_settings").upsert({ id: "wecan_store_id",  value: wecanStoreId.trim() }),
        ]);
        if (r1.error) throw r1.error;
        if (r2.error) throw r2.error;
      } else if (activeTab === "finance") {
        const payload = {
          ads_costs: Number(adsCosts),
          return_fee_per_unit: Number(returnFee),
          product_purchase_prices: purchasePrices,
        };
        const { error } = await supabase
          .from("store_settings")
          .upsert({ id: "financial_settings", value: JSON.stringify(payload) });
        if (error) throw error;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert("Erreur de sauvegarde: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── overlay helpers ──────────────────────────────────────────────────────
  const addOverlay = () => {
    const ov: HeroOverlay = { ...DEFAULT_OVERLAY, id: uid() };
    setOverlays((prev) => [...prev, ov]);
    setSelectedId(ov.id);
  };

  const removeOverlay = (id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateOverlay = (id: string, patch: Partial<HeroOverlay>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  // ── drag-to-position ──────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    draggingId.current = id;
    setSelectedId(id);
    const onMove = (ev: MouseEvent) => {
      if (!draggingId.current || !previewRef.current) return;
      const rect = previewRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      updateOverlay(draggingId.current, { x: Math.round(x), y: Math.round(y) });
    };
    const onUp = () => {
      draggingId.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-heading font-bold text-white">Paramètres</h2>
          <p className="text-gray-500 text-sm mt-1">Gérez l'apparence et les informations de votre boutique.</p>
        </div>
        <button
          onClick={saveSettings}
          disabled={saving || loading}
          className="btn-gold flex items-center gap-2"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : saved ? <Check size={18} /> : <Save size={18} />}
          {saved ? "Enregistré ✓" : "Enregistrer"}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10">
        <TabButton
          active={activeTab === "hero"}
          onClick={() => setActiveTab("hero")}
          icon={<ImageIcon size={15} />}
          label="Page d'accueil"
        />
        <TabButton
          active={activeTab === "contact"}
          onClick={() => setActiveTab("contact")}
          icon={<Info size={15} />}
          label="Nos Informations"
        />
        <TabButton
          active={activeTab === "wecan"}
          onClick={() => setActiveTab("wecan")}
          icon={<Truck size={15} />}
          label="WECAN Livraison"
        />
        <TabButton
          active={activeTab === "finance"}
          onClick={() => setActiveTab("finance")}
          icon={<DollarSign size={15} />}
          label="Finance &amp; Marges"
        />
      </div>

      {loading ? (
        <div className="py-20 flex justify-center text-gray-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : activeTab === "hero" ? (
        /* ════════════ HERO TAB ════════════ */
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
          {/* Left: Preview + drag */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-5">
            <h3 className="text-[#d4af37] text-xs font-semibold uppercase tracking-widest border-b border-white/5 pb-3 mb-4">
              Aperçu — Glissez les textes pour les repositionner
            </h3>
            <div
              ref={previewRef}
              className="relative w-full rounded-xl overflow-hidden bg-black/40 border border-white/10 select-none"
              style={{ aspectRatio: "16/9" }}
            >
              {heroImage && (
                <img src={heroImage} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30" />
              {overlays.map((ov) => (
                <div
                  key={ov.id}
                  onMouseDown={(e) => handleMouseDown(e, ov.id)}
                  className="absolute cursor-grab active:cursor-grabbing"
                  style={{
                    left: `${ov.x}%`,
                    top: `${ov.y}%`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `clamp(10px, ${ov.fontSize * 0.45}px, 60px)`,
                    color: ov.color,
                    fontWeight: ov.bold ? 700 : 400,
                    textAlign: ov.align,
                    whiteSpace: "pre-wrap",
                    textShadow: "0 1px 8px rgba(0,0,0,0.8)",
                    outline: selectedId === ov.id ? "2px dashed #d4af37" : "2px dashed transparent",
                    padding: "2px 4px",
                    borderRadius: 4,
                    zIndex: selectedId === ov.id ? 20 : 10,
                    maxWidth: "80%",
                  }}
                >
                  {ov.text}
                </div>
              ))}
              {overlays.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm pointer-events-none">
                  Ajoutez un texte pour commencer →
                </div>
              )}
            </div>

            {/* Image upload */}
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-gray-400 uppercase tracking-wider">
                Photo d'arrière-plan
              </label>
              <div className="flex gap-2">
                <input
                  value={heroImage}
                  onChange={(e) => setHeroImage(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-gray-300 text-sm outline-none focus:border-[#d4af37]"
                  placeholder="URL de l'image…"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-2 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 transition-colors flex items-center gap-1 text-sm"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  Upload
                </button>
              </div>
              <input type="file" accept="image/*" ref={fileRef} onChange={handleImageUpload} className="hidden" />
            </div>
          </div>

          {/* Right: Overlay list + editor */}
          <div className="space-y-4">
            <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-5">
              <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-3">
                <h3 className="text-[#d4af37] text-xs font-semibold uppercase tracking-widest">Textes</h3>
                <button
                  onClick={addOverlay}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 transition-colors text-xs font-semibold"
                >
                  <Plus size={14} /> Ajouter
                </button>
              </div>
              {overlays.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-4">Aucun texte. Cliquez sur "Ajouter".</p>
              ) : (
                <ul className="space-y-1.5">
                  {overlays.map((ov) => (
                    <li
                      key={ov.id}
                      onClick={() => setSelectedId(ov.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedId === ov.id
                          ? "bg-[#d4af37]/15 border border-[#d4af37]/40"
                          : "bg-black/20 border border-white/5 hover:border-white/15"
                      }`}
                    >
                      <Move size={12} className="text-gray-500 shrink-0" />
                      <span className="flex-1 text-white text-xs truncate">
                        {ov.text.slice(0, 28)}{ov.text.length > 28 ? "…" : ""}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeOverlay(ov.id); }}
                        className="text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selected && (
              <div className="bg-[#0f2847] border border-[#d4af37]/20 rounded-2xl p-5 space-y-4">
                <h3 className="text-[#d4af37] text-xs font-semibold uppercase tracking-widest border-b border-white/5 pb-3">
                  Modifier le texte
                </h3>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Contenu</label>
                  <textarea
                    rows={3}
                    value={selected.text}
                    onChange={(e) => updateOverlay(selected.id, { text: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-[#d4af37] resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Position X ({selected.x}%)</label>
                    <input type="range" min={0} max={100} value={selected.x}
                      onChange={(e) => updateOverlay(selected.id, { x: +e.target.value })}
                      className="w-full accent-[#d4af37]" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Position Y ({selected.y}%)</label>
                    <input type="range" min={0} max={100} value={selected.y}
                      onChange={(e) => updateOverlay(selected.id, { y: +e.target.value })}
                      className="w-full accent-[#d4af37]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Taille ({selected.fontSize}px)</label>
                  <input type="range" min={12} max={120} value={selected.fontSize}
                    onChange={(e) => updateOverlay(selected.id, { fontSize: +e.target.value })}
                    className="w-full accent-[#d4af37]" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Couleur</label>
                    <input type="color" value={selected.color}
                      onChange={(e) => updateOverlay(selected.id, { color: e.target.value })}
                      className="w-full h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Gras</label>
                    <button
                      onClick={() => updateOverlay(selected.id, { bold: !selected.bold })}
                      className={`w-full h-9 rounded-lg border text-sm font-bold transition-colors ${
                        selected.bold
                          ? "bg-[#d4af37] border-[#d4af37] text-[#061121]"
                          : "bg-black/20 border-white/10 text-gray-300 hover:border-white/30"
                      }`}
                    >
                      B
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Alignement</label>
                    <select
                      value={selected.align}
                      onChange={(e) => updateOverlay(selected.id, { align: e.target.value as any })}
                      className="w-full h-9 rounded-lg bg-black/20 border border-white/10 text-gray-300 text-xs px-2 outline-none focus:border-[#d4af37]"
                    >
                      <option value="left">Gauche</option>
                      <option value="center">Centre</option>
                      <option value="right">Droite</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "contact" ? (
        /* ════════════ CONTACT TAB ════════════ */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Phone & WhatsApp */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-4">
            <SectionTitle icon={<Phone size={15} />} label="Téléphone &amp; WhatsApp" />

            <ContactField
              label="Numéro principal"
              placeholder="Ex: 0555 12 34 56"
              value={contact.phone}
              onChange={(v) => setContact({ ...contact, phone: v })}
            />
            <ContactField
              label="Numéro secondaire (optionnel)"
              placeholder="Ex: 0770 98 76 54"
              value={contact.phone2}
              onChange={(v) => setContact({ ...contact, phone2: v })}
            />
            <ContactField
              label="WhatsApp (numéro avec indicatif)"
              placeholder="Ex: +213 555 12 34 56"
              value={contact.whatsapp}
              onChange={(v) => setContact({ ...contact, whatsapp: v })}
            />

            <div className="pt-2 border-t border-white/5">
              <p className="text-gray-600 text-xs">
                💡 Le numéro WhatsApp sera affiché avec un bouton de contact direct.
              </p>
            </div>
          </div>

          {/* Email & Address */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-4">
            <SectionTitle icon={<Mail size={15} />} label="Email &amp; Adresse" />

            <ContactField
              label="Adresse e-mail"
              placeholder="Ex: contact@lemirage.dz"
              value={contact.email}
              onChange={(v) => setContact({ ...contact, email: v })}
              type="email"
            />

            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
                <MapPin size={12} className="inline mr-1" />
                Adresse / Localisation
              </label>
              <textarea
                rows={4}
                value={contact.address}
                onChange={(e) => setContact({ ...contact, address: e.target.value })}
                placeholder={"Ex: Zone industrielle\nOued Smar, Alger\nAlgérie"}
                className="w-full px-3 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-[#d4af37] resize-none placeholder-gray-600"
              />
              <p className="text-gray-600 text-xs mt-1">
                💡 Vous pouvez écrire sur plusieurs lignes.
              </p>
            </div>
          </div>

          {/* Social Media */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-4 lg:col-span-2">
            <SectionTitle icon={<Globe size={15} />} label="Réseaux Sociaux" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ContactField
                label="Instagram"
                placeholder="Ex: @lemirage.textile ou URL complète"
                value={contact.instagram}
                onChange={(v) => setContact({ ...contact, instagram: v })}
                icon={<IGIcon />}
                iconColor="bg-pink-500/20 text-pink-400"
              />
              <ContactField
                label="Facebook"
                placeholder="Ex: @lemirage ou URL complète"
                value={contact.facebook}
                onChange={(v) => setContact({ ...contact, facebook: v })}
                icon={<FBIcon />}
                iconColor="bg-blue-500/20 text-blue-400"
              />
              <ContactField
                label="TikTok"
                placeholder="Ex: @lemirage ou URL complète"
                value={contact.tiktok}
                onChange={(v) => setContact({ ...contact, tiktok: v })}
                icon={<TikTokIcon />}
                iconColor="bg-gray-500/20 text-gray-300"
              />
            </div>

            <div className="border-t border-white/5 pt-4">
              <p className="text-gray-600 text-xs">
                💡 Vous pouvez saisir le nom du compte (ex: @lemirage) ou coller directement l'URL de votre page.
              </p>
            </div>
          </div>

          {/* Preview card */}
          <div className="bg-gradient-to-br from-[#0f2847] to-[#061121] border border-[#d4af37]/20 rounded-2xl p-6 lg:col-span-2">
            <h3 className="text-[#d4af37] text-xs font-semibold uppercase tracking-widest mb-4 pb-3 border-b border-white/5">
              Aperçu — Affichage public
            </h3>
            <div className="flex flex-wrap gap-6 text-sm">
              {contact.phone && (
                <PreviewItem icon="📞" label={contact.phone} />
              )}
              {contact.phone2 && (
                <PreviewItem icon="📱" label={contact.phone2} />
              )}
              {contact.whatsapp && (
                <PreviewItem icon="💬" label={contact.whatsapp} />
              )}
              {contact.email && (
                <PreviewItem icon="✉️" label={contact.email} />
              )}
              {contact.address && (
                <PreviewItem icon="📍" label={contact.address.split("\n")[0] + (contact.address.includes("\n") ? "…" : "")} />
              )}
              {contact.instagram && (
                <PreviewItem icon="📸" label={contact.instagram} />
              )}
              {contact.facebook && (
                <PreviewItem icon="👥" label={contact.facebook} />
              )}
              {contact.tiktok && (
                <PreviewItem icon="🎵" label={contact.tiktok} />
              )}
              {!contact.phone && !contact.email && !contact.address && !contact.instagram && (
                <p className="text-gray-600 text-xs italic">
                  Remplissez les informations ci-dessus et cliquez sur "Enregistrer" pour les afficher sur le site.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === "wecan" ? (
        /* ════════════ WECAN TAB ════════════ */
        <div className="max-w-xl space-y-5">

          {/* Info card */}
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <Truck size={20} className="text-violet-400" />
              <h3 className="text-violet-300 font-semibold text-sm">Intégration WECAN Delivery</h3>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              Connectez votre boutique à WecanServices pour envoyer les commandes directement à la société
              de livraison depuis votre panel admin. Obtenez votre token depuis votre tableau de bord
              WecanServices → Paramètres → API / Développeur.
            </p>
            <a
              href="https://wecanservices.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 text-xs mt-3 underline"
            >
              Ouvrir WecanServices.com →
            </a>
          </div>

          {/* Token input */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-5">
            <SectionTitle icon={<Truck size={15} />} label="Identifiants API" />

            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
                Token API WECAN
              </label>
              <div className="flex gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={wecanToken}
                  onChange={e => { setWecanToken(e.target.value); setWecanStatus("idle"); }}
                  placeholder="Collez votre Bearer token ici…"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-violet-500 transition-colors placeholder-gray-600 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white transition-colors"
                  title={showToken ? "Masquer" : "Afficher"}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-gray-600 text-xs mt-1.5">
                💡 Ce token est stocké en base de données et n&apos;est jamais exposé au navigateur client.
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
                Store ID (optionnel)
              </label>
              <input
                type="text"
                value={wecanStoreId}
                onChange={e => setWecanStoreId(e.target.value)}
                placeholder="Ex: 12345 (visible dans votre dashboard WECAN)"
                className="w-full px-3 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-violet-500 transition-colors placeholder-gray-600"
              />
            </div>

            {/* Connection status */}
            {wecanStatus !== "idle" && (
              <div className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${
                wecanStatus === "testing" ? "bg-white/5 border-white/10 text-gray-400" :
                wecanStatus === "ok"      ? "bg-green-500/10 border-green-500/30 text-green-400" :
                                           "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {wecanStatus === "testing" ? (
                  <Loader2 size={16} className="animate-spin mt-0.5 flex-shrink-0" />
                ) : wecanStatus === "ok" ? (
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
                ) : (
                  <span className="mt-0.5 flex-shrink-0 text-base">⚠️</span>
                )}
                <span>{wecanTestMsg}</span>
              </div>
            )}

            <p className="text-gray-600 text-xs border-t border-white/5 pt-4">
              Après avoir renseigné votre token, cliquez sur <strong className="text-gray-400">Enregistrer</strong> en haut à droite.
              Le token sera disponible immédiatement dans le panel de gestion des commandes.
            </p>
          </div>

          {/* How it works */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6">
            <h3 className="text-[#d4af37] text-xs font-semibold uppercase tracking-widest mb-4 pb-3 border-b border-white/5">
              Comment ça fonctionne ?
            </h3>
            <ol className="space-y-3 text-sm text-gray-400">
              {[
                ["1", "Le client passe une commande sur votre boutique."],
                ["2", "La commande apparaît dans votre panel admin → Commandes."],
                ["3", "Cliquez sur une commande → appuyez sur le bouton violet \"Envoyer à WECAN\"."],
                ["4", "La commande est automatiquement transmise à WecanServices avec toutes les infos client."],
                ["5", "Le statut passe à \"Chez la société de livraison\" automatiquement."],
              ].map(([num, text]) => (
                <li key={num} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {num}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : activeTab === "finance" ? (
        /* ════════════ FINANCE TAB ════════════ */
        <div className="max-w-2xl space-y-5">
          {/* General financial parameters */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-4">
            <SectionTitle icon={<DollarSign size={15} />} label="Paramètres Généraux" />

            <div className="max-w-xs">
              <label className="block text-xs text-gray-400 mb-1.5 uppercase tracking-wider">
                Frais fixes par retour (DA)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={returnFee}
                  onChange={(e) => setReturnFee(e.target.value)}
                  placeholder="Ex: 400"
                  className="w-full px-3 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-[#d4af37]"
                />
                <span className="text-sm text-gray-400">DA</span>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                Coût moyen d'un retour (frais de livraison retour WECAN + emballage perdu).
              </p>
            </div>
          </div>

          {/* Pricing lists - COGS (purchase prices) & Ads Costs per product */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl p-6 space-y-4">
            <SectionTitle icon={<Package size={15} />} label="Coûts et Prix d'Achat par Produit" />
            <p className="text-xs text-gray-400 leading-relaxed">
              Saisissez le **prix d'achat** (prix de gros d'usine) et le **budget publicitaire (Ads)** spécifique à chaque produit.
            </p>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {products.length === 0 ? (
                <p className="text-gray-500 text-xs italic text-center py-4">Aucun produit configuré dans l'inventaire.</p>
              ) : (
                products.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/10 p-3 rounded-xl border border-white/5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">{p.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{p.category || "Sans catalogue"}</p>
                    </div>
                    
                    <div className="flex gap-3 flex-shrink-0">
                      {/* Purchase Price Input */}
                      <div className="w-28">
                        <label className="block text-[9px] text-gray-500 uppercase mb-0.5">Prix d'achat</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={purchasePrices[p.id] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPurchasePrices((prev: any) => ({
                                ...prev,
                                [p.id]: val === "" ? 0 : Number(val),
                              }));
                            }}
                            placeholder="0"
                            className="w-full px-2 py-1 rounded-lg bg-black/20 border border-white/10 text-white text-right text-xs outline-none focus:border-[#d4af37]"
                          />
                          <span className="text-[10px] text-gray-400">DA</span>
                        </div>
                      </div>

                      {/* Ads Cost Input */}
                      <div className="w-28">
                        <label className="block text-[9px] text-gray-500 uppercase mb-0.5">Coût Pubs (Ads)</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={adsCosts[p.id] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAdsCosts((prev: any) => ({
                                ...prev,
                                [p.id]: val === "" ? 0 : Number(val),
                              }));
                            }}
                            placeholder="0"
                            className="w-full px-2 py-1 rounded-lg bg-black/20 border border-white/10 text-white text-right text-xs outline-none focus:border-[#d4af37]"
                          />
                          <span className="text-[10px] text-gray-400">DA</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


// ── Sub-components ────────────────────────────────────────────────────────────

function TabButton({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-[#d4af37] text-[#d4af37]"
          : "border-transparent text-gray-500 hover:text-gray-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/5 pb-3">
      <span className="text-[#d4af37]">{icon}</span>
      <h3
        className="text-[#d4af37] text-xs font-semibold uppercase tracking-widest"
        dangerouslySetInnerHTML={{ __html: label }}
      />
    </div>
  );
}

function ContactField({
  label, placeholder, value, onChange, type = "text", icon, iconColor,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  icon?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
        {icon && (
          <span className={`w-5 h-5 rounded flex items-center justify-center ${iconColor ?? ""}`}>
            {icon}
          </span>
        )}
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white text-sm outline-none focus:border-[#d4af37] transition-colors placeholder-gray-600"
      />
    </div>
  );
}

function PreviewItem({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-base">{icon}</span>
      <span className="text-gray-300 text-sm">{label}</span>
    </div>
  );
}

function IGIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function FBIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
    </svg>
  );
}

