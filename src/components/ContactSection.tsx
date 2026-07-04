"use client";

import { useState } from "react";
import { Phone, Mail, MapPin, Send, CheckCircle, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export interface ContactInfo {
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  whatsapp?: string;
}

interface Props {
  contactInfo?: ContactInfo;
}

export function ContactSection({ contactInfo = {} }: Props) {
  const [form, setForm] = useState({ name: "", phone: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const hasAnyContact =
    contactInfo.phone ||
    contactInfo.phone2 ||
    contactInfo.email ||
    contactInfo.address ||
    contactInfo.instagram ||
    contactInfo.facebook ||
    contactInfo.tiktok ||
    contactInfo.whatsapp;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.message.trim()) return;
    setStatus("sending");
    try {
      const { error } = await supabase.from("contact_messages").insert({
        customer_name: form.name,
        customer_phone: form.phone,
        message: form.message,
        created_at: new Date().toISOString(),
        is_read: false,
      });
      if (error) throw error;
      setStatus("sent");
      setForm({ name: "", phone: "", message: "" });
      setTimeout(() => setStatus("idle"), 5000);
    } catch (err: any) {
      console.error("Submission error:", err);
      alert("Erreur: Impossible d'envoyer le message. Assurez-vous que la table 'contact_messages' a été créée dans Supabase. " + (err.message || ""));
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  };

  return (
    <section
      id="contact"
      className="bg-[#061121] py-20 px-4 sm:px-6"
      style={{
        background: "linear-gradient(180deg, #061121 0%, #0a1a35 50%, #061121 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-14">
          <span
            className="inline-block text-xs font-semibold uppercase text-[#d4af37] mb-3"
            style={{ letterSpacing: "0.25em" }}
          >
            Nous Contacter
          </span>
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-white">
            Une question ? On est là.
          </h2>
          <div className="w-16 h-0.5 bg-[#d4af37] mx-auto mt-4 rounded-full" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* ── Left: Contact info ── */}
          <div className="space-y-6">
            <div className="bg-[#0f2847]/60 border border-white/5 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
              <h3 className="text-[#d4af37] font-semibold text-sm uppercase tracking-widest mb-6 pb-4 border-b border-white/5">
                Nos Coordonnées
              </h3>

              {!hasAnyContact ? (
                <p className="text-gray-500 text-sm italic">
                  Les informations de contact seront bientôt disponibles.
                </p>
              ) : (
                <div className="space-y-5">
                  {(contactInfo.phone || contactInfo.phone2) && (
                    <ContactRow icon={<Phone size={18} />} label="Téléphone">
                      <div className="space-y-1">
                        {contactInfo.phone && (
                          <a
                            href={`tel:${contactInfo.phone.replace(/\s/g, "")}`}
                            className="block text-white hover:text-[#d4af37] transition-colors font-medium"
                          >
                            {contactInfo.phone}
                          </a>
                        )}
                        {contactInfo.phone2 && (
                          <a
                            href={`tel:${contactInfo.phone2.replace(/\s/g, "")}`}
                            className="block text-gray-300 hover:text-[#d4af37] transition-colors text-sm"
                          >
                            {contactInfo.phone2}
                          </a>
                        )}
                      </div>
                    </ContactRow>
                  )}

                  {contactInfo.whatsapp && (
                    <ContactRow icon={<WAIcon />} label="WhatsApp">
                      <a
                        href={`https://wa.me/${contactInfo.whatsapp.replace(/[^\d]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-[#25D366] transition-colors font-medium"
                      >
                        {contactInfo.whatsapp}
                      </a>
                    </ContactRow>
                  )}

                  {contactInfo.email && (
                    <ContactRow icon={<Mail size={18} />} label="Email">
                      <a
                        href={`mailto:${contactInfo.email}`}
                        className="text-white hover:text-[#d4af37] transition-colors font-medium break-all"
                      >
                        {contactInfo.email}
                      </a>
                    </ContactRow>
                  )}

                  {contactInfo.address && (
                    <ContactRow icon={<MapPin size={18} />} label="Adresse">
                      <p className="text-white font-medium whitespace-pre-line">
                        {contactInfo.address}
                      </p>
                    </ContactRow>
                  )}
                </div>
              )}
            </div>

            {/* Social media */}
            {(contactInfo.instagram || contactInfo.facebook || contactInfo.tiktok) && (
              <div className="bg-[#0f2847]/60 border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
                <h3 className="text-[#d4af37] font-semibold text-sm uppercase tracking-widest mb-5 pb-4 border-b border-white/5">
                  Réseaux Sociaux
                </h3>
                <div className="flex flex-wrap gap-3">
                  {contactInfo.instagram && (
                    <SocialButton
                      href={
                        contactInfo.instagram.startsWith("http")
                          ? contactInfo.instagram
                          : `https://instagram.com/${contactInfo.instagram.replace("@", "")}`
                      }
                      label="Instagram"
                      gradient="linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
                      icon={<IGIcon />}
                    />
                  )}
                  {contactInfo.facebook && (
                    <SocialButton
                      href={
                        contactInfo.facebook.startsWith("http")
                          ? contactInfo.facebook
                          : `https://facebook.com/${contactInfo.facebook.replace("@", "")}`
                      }
                      label="Facebook"
                      gradient="linear-gradient(135deg, #1877F2, #0d5ebf)"
                      icon={<FBIcon />}
                    />
                  )}
                  {contactInfo.tiktok && (
                    <SocialButton
                      href={
                        contactInfo.tiktok.startsWith("http")
                          ? contactInfo.tiktok
                          : `https://tiktok.com/@${contactInfo.tiktok.replace("@", "")}`
                      }
                      label="TikTok"
                      gradient="linear-gradient(135deg, #010101, #69C9D0)"
                      icon={<TTIcon />}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Message form ── */}
          <div className="bg-[#0f2847]/60 border border-white/5 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
            <h3 className="text-[#d4af37] font-semibold text-sm uppercase tracking-widest mb-6 pb-4 border-b border-white/5">
              Envoyer un Message
            </h3>

            {status === "sent" ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle className="text-green-400 mb-4" size={48} />
                <p className="text-white font-semibold text-lg mb-1">Message envoyé !</p>
                <p className="text-gray-400 text-sm">
                  Nous vous répondrons dans les plus brefs délais.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
                    Votre nom *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex: Ahmed Benali"
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-600 text-sm outline-none focus:border-[#d4af37] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
                    Numéro de téléphone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Ex: 0555 12 34 56"
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-600 text-sm outline-none focus:border-[#d4af37] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wider">
                    Votre message *
                  </label>
                  <textarea
                    required
                    rows={5}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="Écrivez votre question ou demande ici…"
                    className="w-full px-4 py-3 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-600 text-sm outline-none focus:border-[#d4af37] transition-colors resize-none"
                  />
                </div>

                {status === "error" && (
                  <p className="text-red-400 text-sm">
                    Une erreur s'est produite. Veuillez réessayer.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="btn-gold w-full flex items-center justify-center gap-2"
                >
                  {status === "sending" ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Envoi en cours…
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Envoyer le message
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ContactRow({
  icon, label, children,
}: {
  icon: React.ReactNode; label: string; children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/20 flex items-center justify-center text-[#d4af37]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">{label}</p>
        {children}
      </div>
    </div>
  );
}

function SocialButton({
  href, label, gradient, icon,
}: {
  href: string; label: string; gradient: string; icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:scale-105 hover:shadow-lg"
      style={{ background: gradient }}
    >
      {icon}
      {label}
    </a>
  );
}

// ── Brand SVG icons (not in lucide-react) ─────────────────────────────────────

function IGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

function FBIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function WAIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function TTIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
    </svg>
  );
}
