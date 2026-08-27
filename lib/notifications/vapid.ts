// Pure - no 'server-only', no web-push import. Split out of push.ts purely
// so this validation logic is unit-testable, same reasoning as
// pushErrors.ts's header comment: 'server-only' unconditionally throws
// outside of Next's own bundler, so a plain `node --test` run of anything
// that imports it - including push.ts itself - fails immediately.

export interface VapidConfig {
  publicKey?: string
  privateKey?: string
  email?: string
}

export interface VapidConfigValidation {
  valid: boolean
  errors: string[]
}

// An uncompressed P-256 elliptic-curve public key is always exactly 65 raw
// bytes (0x04 prefix + 32-byte X + 32-byte Y); the matching private key (a
// raw P-256 scalar) is always exactly 32 raw bytes. web-push encodes both as
// unpadded base64url. Checking these byte lengths up front catches a
// truncated/corrupted/mismatched key pair with a specific, actionable error
// instead of the generic "Vapid public key should be 65 bytes long when
// decoded" thrown deep inside web-push's own validator - the exact
// production incident this replaces (a malformed
// NEXT_PUBLIC_VAPID_PUBLIC_KEY crashed the entire notification sweep for
// every user on every affected tick, since nothing checked this ahead of
// time - see lib/notifications/push.ts's ensureVapidConfigured and
// app/api/cron/notifications/route.ts's up-front check).
const VAPID_PUBLIC_KEY_BYTES = 65
const VAPID_PRIVATE_KEY_BYTES = 32
const BASE64URL_PATTERN = /^[A-Za-z0-9\-_]+=*$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function decodedByteLength(value: string): number | null {
  if (!BASE64URL_PATTERN.test(value)) return null
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(base64, 'base64').length
  } catch {
    return null
  }
}

function describeLength(len: number | null): string {
  return len === null ? 'an unparseable value' : `${len} bytes`
}

// Validates a VAPID key pair's shape, not just its presence. Deliberately
// takes the config as a plain object (rather than reading process.env
// itself) so it stays pure and trivially testable with synthetic values -
// lib/notifications/push.ts's readVapidConfigFromEnv is the one place that
// reads real environment variables and hands them to this function.
export function validateVapidConfig(config: VapidConfig): VapidConfigValidation {
  const errors: string[] = []
  const { publicKey, privateKey, email } = config

  if (!publicKey) {
    errors.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set')
  } else {
    const len = decodedByteLength(publicKey)
    if (len !== VAPID_PUBLIC_KEY_BYTES) {
      errors.push(
        `NEXT_PUBLIC_VAPID_PUBLIC_KEY must decode to ${VAPID_PUBLIC_KEY_BYTES} bytes (an uncompressed P-256 public key), but decoded to ${describeLength(len)}`
      )
    }
  }

  if (!privateKey) {
    errors.push('VAPID_PRIVATE_KEY is not set')
  } else {
    const len = decodedByteLength(privateKey)
    if (len !== VAPID_PRIVATE_KEY_BYTES) {
      errors.push(
        `VAPID_PRIVATE_KEY must decode to ${VAPID_PRIVATE_KEY_BYTES} bytes, but decoded to ${describeLength(len)}`
      )
    }
  }

  if (!email) {
    errors.push('VAPID_EMAIL is not set')
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.push('VAPID_EMAIL does not look like a valid email address')
  }

  return { valid: errors.length === 0, errors }
}
