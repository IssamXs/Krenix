import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// AES-256-GCM at-rest encryption for third-party tokens (Meta page tokens).
// TOKEN_ENC_KEY must be a base64-encoded 32-byte key.
function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY
  if (!raw) throw new Error('TOKEN_ENC_KEY is not set')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('TOKEN_ENC_KEY must decode to 32 bytes')
  return buf
}

// Format: iv:authTag:ciphertext (each base64).
export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptToken(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted token')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
