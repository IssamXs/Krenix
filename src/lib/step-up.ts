import crypto from 'crypto'

const secret = () => process.env.SUPERADMIN_STEPUP_SECRET ?? ''
export const STEPUP_COOKIE = 'sa_stepup'
export const STEPUP_TTL_MS = 5 * 60 * 1000

// Cookie value = `${expiryMs}.${hmac(userId.expiryMs)}`. Short-lived, per-user.
export function signStepUp(userId: string, now: number = Date.now()): string {
  const expiry = now + STEPUP_TTL_MS
  const sig = crypto.createHmac('sha256', secret()).update(`${userId}.${expiry}`).digest('hex')
  return `${expiry}.${sig}`
}

export function verifyStepUp(cookieValue: string | null | undefined, userId: string, now: number = Date.now()): boolean {
  const s = secret()
  if (!cookieValue || !s) return false
  const [expiryStr, sig] = cookieValue.split('.')
  if (!expiryStr || !sig) return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < now) return false
  const expected = crypto.createHmac('sha256', s).update(`${userId}.${expiry}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}

export const BACKUP_SESSION_COOKIE = 'sa_backup_session'
export const BACKUP_SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function signBackupSession(userId: string, now: number = Date.now()): string {
  const expiry = now + BACKUP_SESSION_TTL_MS
  const sig = crypto.createHmac('sha256', secret()).update(`backup.${userId}.${expiry}`).digest('hex')
  return `${expiry}.${sig}`
}

export function verifyBackupSession(cookieValue: string | null | undefined, userId: string, now: number = Date.now()): boolean {
  const s = secret()
  if (!cookieValue || !s) return false
  const [expiryStr, sig] = cookieValue.split('.')
  if (!expiryStr || !sig) return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < now) return false
  const expected = crypto.createHmac('sha256', s).update(`backup.${userId}.${expiry}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}
