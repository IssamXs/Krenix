'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Check, X } from 'lucide-react'
import Link from 'next/link'

interface SANotification {
  id: string
  title: string
  message: string
  type: string
  is_read: boolean
  action_url: string | null
  created_at: string
}

export default function SuperAdminNotifications() {
  const [notifications, setNotifications] = useState<SANotification[]>([])
  const [open, setOpen] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchNotifications()

    // A dropped/errored realtime channel must not crash the bell — it just
    // means live pushes stop until reconnect; the next open() still refetches.
    const channel = supabase
      .channel('sa_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'super_admin_notifications' }, (payload) => {
        setNotifications(prev => [payload.new as SANotification, ...prev])
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[SuperAdminNotifications] realtime channel issue:', status, err)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Network failures (dropped connection, paused project, ad-blocker) throw
  // from fetch itself — without a try/catch that's an uncaught rejection that
  // Next.js surfaces as a crashing "Failed to fetch" overlay. Fail quietly
  // instead: the bell just stays at its last known state until the next poll.
  const fetchNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('super_admin_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      if (data) setNotifications(data as SANotification[])
    } catch (e) {
      console.error('[SuperAdminNotifications] fetch failed:', e)
    }
  }

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    try {
      const { error } = await supabase.from('super_admin_notifications').update({ is_read: true }).eq('id', id)
      if (error) throw error
    } catch (e) {
      console.error('[SuperAdminNotifications] markAsRead failed:', e)
    }
  }

  const markAllAsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    try {
      const { error } = await supabase.from('super_admin_notifications').update({ is_read: true }).eq('is_read', false)
      if (error) throw error
    } catch (e) {
      console.error('[SuperAdminNotifications] markAllAsRead failed:', e)
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="relative z-50">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-dash-ink-soft hover:text-dash-ink hover:bg-dash-surface-2 transition-all"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-dash-danger animate-pulse" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col rounded-2xl border border-dash-border shadow-2xl z-50 overflow-hidden bg-dash-surface">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dash-border bg-dash-surface-2">
              <h3 className="font-bold text-sm text-dash-ink">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-dash-accent hover:opacity-80">
                    Tout marquer lu
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-dash-ink-soft hover:text-dash-ink">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto dash-scroll">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-dash-ink-soft">
                  Aucune notification
                </div>
              ) : (
                <div className="divide-y divide-dash-border">
                  {notifications.map(n => (
                    <div key={n.id} className={`p-4 transition-all ${!n.is_read ? 'bg-dash-accent-soft/40' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm mb-1 ${!n.is_read ? 'font-bold text-dash-ink' : 'font-medium text-dash-ink-soft'}`}>
                            {n.title}
                          </p>
                          <p className="text-xs text-dash-ink-soft leading-relaxed mb-2">
                            {n.message}
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-dash-ink-faint">
                              {new Date(n.created_at).toLocaleDateString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {n.action_url && (
                              <Link
                                href={n.action_url}
                                onClick={() => { markAsRead(n.id); setOpen(false) }}
                                className="text-[11px] font-semibold text-dash-accent hover:opacity-80"
                              >
                                Voir les détails →
                              </Link>
                            )}
                          </div>
                        </div>
                        {!n.is_read && (
                          <button
                            onClick={() => markAsRead(n.id)}
                            className="p-1 rounded-full text-dash-accent hover:bg-dash-accent-soft transition-colors shrink-0"
                            title="Marquer comme lu"
                          >
                            <Check size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
