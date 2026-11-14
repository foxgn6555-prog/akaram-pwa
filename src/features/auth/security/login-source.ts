/** Stable, non-secret browser source key for server-enforced per-device login limits. */
const STORAGE_KEY = 'akram:login-source:v1'
let ephemeralSourceId: string | null = null
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function getLoginSourceId(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && UUID_RE.test(stored)) return stored
    const generated = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, generated)
    return generated
  } catch {
    // Private browsing/storage-disabled environments reuse a per-page source ID.
    ephemeralSourceId ??= crypto.randomUUID()
    return ephemeralSourceId
  }
}
