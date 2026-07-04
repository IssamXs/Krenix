"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, MessageSquare, Phone, Trash2, MailOpen, Mail } from "lucide-react";

interface ContactMessage {
  id: string;
  customer_name: string;
  customer_phone: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("contact_messages")
        .select("*")
        .order("created_at", { ascending: false });
      setMessages(data ?? []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (msg: ContactMessage) => {
    setSelected(msg);
    if (!msg.is_read) {
      await supabase
        .from("contact_messages")
        .update({ is_read: true })
        .eq("id", msg.id);
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, is_read: true } : m))
      );
    }
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("Supprimer ce message ?")) return;
    setDeleting(id);
    await supabase.from("contact_messages").delete().eq("id", id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    if (selected?.id === id) setSelected(null);
    setDeleting(null);
  };

  const unreadCount = messages.filter((m) => !m.is_read).length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-heading font-bold text-white">Messages Clients</h2>
          {unreadCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-[#d4af37]/20 text-[#d4af37] text-xs font-bold">
              {unreadCount} non lu{unreadCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Messages envoyés par vos clients via le formulaire de contact.
        </p>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center text-gray-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="bg-[#0f2847] border border-white/5 rounded-2xl py-20 flex flex-col items-center justify-center text-center gap-4">
          <MessageSquare className="text-gray-600" size={40} />
          <div>
            <p className="text-white font-semibold">Aucun message pour l'instant</p>
            <p className="text-gray-500 text-sm mt-1">
              Les messages de vos clients apparaîtront ici.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">
          {/* List */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/5">
              <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                {messages.length} message{messages.length > 1 ? "s" : ""}
              </p>
            </div>
            <ul className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  onClick={() => markAsRead(msg)}
                  className={`p-4 cursor-pointer transition-colors hover:bg-white/3 ${
                    selected?.id === msg.id ? "bg-[#d4af37]/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!msg.is_read && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-[#d4af37]" />
                      )}
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${msg.is_read ? "text-gray-300" : "text-white"}`}>
                          {msg.customer_name}
                        </p>
                        <p className="text-gray-500 text-xs mt-0.5 flex items-center gap-1">
                          <Phone size={10} />
                          {msg.customer_phone}
                        </p>
                      </div>
                    </div>
                    <p className="text-gray-600 text-xs flex-shrink-0 mt-0.5">
                      {new Date(msg.created_at).toLocaleDateString("fr-DZ", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <p className="text-gray-500 text-xs mt-2 line-clamp-2 pl-4">
                    {msg.message}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail */}
          <div className="bg-[#0f2847] border border-white/5 rounded-2xl overflow-hidden">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-4 text-gray-600">
                <MailOpen size={32} />
                <p className="text-sm">Sélectionnez un message pour le lire</p>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-semibold text-lg">{selected.customer_name}</h3>
                      {selected.is_read ? (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <MailOpen size={12} /> Lu
                        </span>
                      ) : (
                        <span className="text-xs text-[#d4af37] flex items-center gap-1">
                          <Mail size={12} /> Nouveau
                        </span>
                      )}
                    </div>
                    <a
                      href={`tel:${selected.customer_phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-1.5 text-[#d4af37] hover:underline text-sm mt-1"
                    >
                      <Phone size={13} />
                      {selected.customer_phone}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <p className="text-gray-500 text-xs">
                      {new Date(selected.created_at).toLocaleDateString("fr-DZ", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <button
                      onClick={() => deleteMessage(selected.id)}
                      disabled={deleting === selected.id}
                      className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      title="Supprimer"
                    >
                      {deleting === selected.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Trash2 size={14} />
                      )}
                    </button>
                  </div>
                </div>

                {/* Message */}
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Message</p>
                  <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                    <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                      {selected.message}
                    </p>
                  </div>
                </div>

                {/* Quick reply links */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <a
                    href={`tel:${selected.customer_phone.replace(/\s/g, "")}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] hover:bg-[#d4af37]/20 transition-colors text-sm font-medium"
                  >
                    <Phone size={14} />
                    Appeler
                  </a>
                  <a
                    href={`https://wa.me/${selected.customer_phone.replace(/[^\d]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors text-sm font-medium"
                  >
                    <WhatsAppIcon />
                    WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
