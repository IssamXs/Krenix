'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

// GitHub mark — lucide dropped brand logos, so inline it (same as GoogleIcon).
function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.05-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.92 1.23 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22 0 1.6-.01 2.89-.01 3.29 0 .32.21.7.82.58A12 12 0 0024 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  )
}

// Google "G" — lucide dropped brand logos, so inline the official multi-colour mark.
function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  )
}

export default function OAuthButtons() {
  const [busy, setBusy] = useState<'google' | 'github' | null>(null)
  const [error, setError] = useState('')

  const signIn = async (provider: 'google' | 'github') => {
    setBusy(provider); setError('')
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (err) {
      setError(err.message || 'Connexion impossible pour le moment.')
      setBusy(null)
    }
    // On success the browser is redirected to the provider — no further action here.
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{error}</div>
      )}
      <button
        type="button"
        onClick={() => signIn('google')}
        disabled={!!busy}
        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-medium text-sm bg-white text-gray-800 transition-all hover:bg-gray-100 disabled:opacity-60"
      >
        {busy === 'google' ? <Loader2 size={16} className="animate-spin" /> : <GoogleIcon />} Continuer avec Google
      </button>
      <button
        type="button"
        onClick={() => signIn('github')}
        disabled={!!busy}
        className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-medium text-sm bg-[#1b1f24] text-white border border-white/10 transition-all hover:bg-[#24292f] disabled:opacity-60"
      >
        {busy === 'github' ? <Loader2 size={16} className="animate-spin" /> : <GithubIcon />} Continuer avec GitHub
      </button>
    </div>
  )
}
