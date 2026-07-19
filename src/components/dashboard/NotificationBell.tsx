'use client'

import { useState, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, Info, AlertTriangle, CreditCard, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { type Notification } from '@/types/database'

// Outside the component and returns rather than setting state itself, so the
// effect can setState from a .then() callback instead of a setState call
// buried inside an awaited function body — satisfies react-hooks/set-state-in-effect
// and keeps the fetch reusable for both the initial load and the poll interval.
async function fetchNotifications(): Promise<Notification[]> {
  try {
    const res = await fetch('/api/notifications')
    if (res.ok) return await res.json()
  } catch (e) {
    console.error('Error fetching notifications:', e)
  }
  return []
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchNotifications().then(setNotifications)
    const interval = setInterval(() => { fetchNotifications().then(setNotifications) }, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = notifications.filter(n => !n.is_read).length

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
    } catch (e) { console.error('markAsRead failed:', e) }
  }

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    try {
      await fetch('/api/notifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markAllRead: true }),
      })
    } catch (e) { console.error('markAllAsRead failed:', e) }
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'order': return <ShoppingBag size={16} className="text-dash-success" />
      case 'billing': return <CreditCard size={16} className="text-dash-gold-dark" />
      case 'alert': return <AlertTriangle size={16} className="text-dash-danger" />
      default: return <Info size={16} className="text-dash-info" />
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-dash-ink-soft hover:text-dash-ink transition-colors rounded-xl hover:bg-dash-surface-2"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1.5 w-2 h-2 bg-dash-danger rounded-full animate-pulse" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 mt-2 w-80 md:w-96 bg-dash-surface border border-dash-border rounded-2xl shadow-[0_16px_40px_-16px_oklch(0.18_0.01_255_/_0.3)] z-50 overflow-hidden flex flex-col max-h-[80vh]"
          >
            <div className="px-4 py-3 border-b border-dash-border flex items-center justify-between bg-dash-surface-2">
              <h3 className="dash-font-sans font-bold text-dash-ink text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-dash-ink-soft hover:text-dash-ink flex items-center gap-1 transition-colors">
                  <Check size={12} /> Tout marquer comme lu
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-dash-ink-faint text-sm">Aucune notification pour le moment.</div>
              ) : (
                <div className="divide-y divide-dash-border">
                  {notifications.map((n, i) => {
                    const content = (
                      <motion.div
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.2) }}
                        className={`p-4 flex gap-3 transition-colors ${!n.is_read ? 'bg-dash-accent-soft/40' : 'hover:bg-dash-surface-2'}`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <div className="w-8 h-8 rounded-full bg-dash-surface-2 flex items-center justify-center">
                            {getIcon(n.type)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${!n.is_read ? 'text-dash-ink font-semibold' : 'text-dash-ink-soft'}`}>{n.title}</p>
                          <p className="text-xs text-dash-ink-faint mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-dash-ink-faint mt-2 uppercase tracking-wider">
                            {new Date(n.created_at).toLocaleString('fr-DZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        {!n.is_read && (
                          <div className="flex-shrink-0 flex items-center">
                            <div className="w-2 h-2 rounded-full bg-dash-accent" />
                          </div>
                        )}
                      </motion.div>
                    )

                    if (n.action_url) {
                      return (
                        <Link key={n.id} href={n.action_url} onClick={() => { if (!n.is_read) markAsRead(n.id); setIsOpen(false) }} className="block">
                          {content}
                        </Link>
                      )
                    }
                    return (
                      <div key={n.id} onClick={() => !n.is_read && markAsRead(n.id)} className="cursor-pointer">
                        {content}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
