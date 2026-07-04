'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, X, Send, Loader2, ShoppingBag, Bot } from 'lucide-react'
import type { ChatMessage, Store } from '@/types/database'

interface Props {
  store: Store
}

function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export default function ChatbotWidget({ store }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(generateSessionId)
  const [orderCreated, setOrderCreated] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const bg = theme?.colors.background ?? '#0A0A0F'
  const card = theme?.colors.card ?? '#111118'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  // Greeting message on first open — merchant-customizable, with a sensible default
  useEffect(() => {
    if (open && messages.length === 0) {
      const customGreeting = store.settings?.chatbot?.greeting?.trim()
      setMessages([{
        role: 'assistant',
        content: customGreeting
          || `مرحبا! 👋 Bienvenue chez **${store.name}** !\n\nJe suis votre assistant. Je peux vous aider à :\n• Choisir un produit\n• Répondre à vos questions\n• Prendre votre commande\n\nComment puis-je vous aider ?`,
        timestamp: new Date().toISOString(),
      }])
    }
  }, [open, messages.length, store.name, store.settings])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/ai/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          sessionId,
          message: text,
          history: messages,
        }),
      })
      const data = await res.json()

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply || 'Désolé, une erreur est survenue.',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])

      if (data.orderId) {
        setOrderCreated(true)
      }
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Désolé, je ne peux pas répondre pour le moment. Réessayez.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // Render message with basic markdown (bold)
  const renderText = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i}>{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    )
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
        style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 8px 24px ${primary}50` }}
        aria-label="Chat"
      >
        {open ? <X size={22} style={{ color: bg }} /> : <MessageCircle size={22} style={{ color: bg }} />}
        {!open && messages.length === 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-[#0A0A0F]" />
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-24 right-5 z-50 w-[340px] max-h-[520px] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: card, border: `1px solid ${border}`, boxShadow: `0 24px 60px rgba(0,0,0,0.5)` }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: primary, color: bg }}>
            <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center">
              <Bot size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{store.name}</p>
              <p className="text-xs opacity-70">Assistant virtuel</p>
            </div>
            <button onClick={() => setOpen(false)} className="opacity-70 hover:opacity-100 transition-opacity">
              <X size={18} />
            </button>
          </div>

          {/* Order success banner */}
          {orderCreated && (
            <div className="px-4 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ background: 'rgba(34,197,94,0.1)', borderBottom: `1px solid rgba(34,197,94,0.2)` }}>
              <ShoppingBag size={14} className="text-green-400 flex-shrink-0" />
              <p className="text-green-400 text-xs font-medium">Commande créée ! Vous serez contacté bientôt.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3 min-h-0">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5"
                    style={{ background: `${primary}20` }}>
                    <Bot size={12} style={{ color: primary }} />
                  </div>
                )}
                <div
                  className="max-w-[80%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background: msg.role === 'user' ? primary : 'rgba(255,255,255,0.06)',
                    color: msg.role === 'user' ? bg : '#E5E7EB',
                    borderBottomRightRadius: msg.role === 'user' ? 4 : undefined,
                    borderBottomLeftRadius: msg.role === 'assistant' ? 4 : undefined,
                  }}
                >
                  {renderText(msg.content)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mr-2"
                  style={{ background: `${primary}20` }}>
                  <Bot size={12} style={{ color: primary }} />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="flex gap-1 items-center h-4">
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: primary, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${border}` }}>
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Écrivez votre message…"
                rows={1}
                className="flex-1 px-4 py-2.5 rounded-2xl text-sm resize-none outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${border}`, color: '#E5E7EB', maxHeight: 80 }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80 disabled:opacity-30"
                style={{ background: primary }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" style={{ color: bg }} /> : <Send size={16} style={{ color: bg }} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
