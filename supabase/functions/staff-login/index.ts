import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://localhost:3000,https://akram.example.iq,https://arena.ai').split(',').map((value) => value.trim())
function headersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const preview = /^https:\/\/[0-9]+-[a-z0-9-]+\.e2b\.app$/i.test(origin)
  const allowed = ALLOWED_ORIGINS.includes(origin) || preview
  return { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}) }
}
function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin') ?? ''
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headersFor(req) })
  if (origin && !headersFor(req)['Access-Control-Allow-Origin']) return new Response('Origin not allowed', { status: 403 })
  return null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const json = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...headersFor(req), 'Content-Type': 'application/json' } })

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') return json(req, { error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!url || !serviceRole || !anonKey) return json(req, { error: 'CONFIGURATION' }, 503)

    const body = await req.json().catch(() => null) as { email?: unknown; password?: unknown; source_id?: unknown } | null
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = typeof body?.password === 'string' ? body.password : ''
    const sourceId = String(body?.source_id ?? '')
    if (!EMAIL_RE.test(email) || email.length > 254 || password.length < 1 || password.length > 1024 || !UUID_RE.test(sourceId)) {
      return json(req, { error: 'INVALID_INPUT' }, 400)
    }

    // Hash the browser identifier server-side; raw device identifiers are never persisted.
    const sourceHash = await hmac(`login-device:v1:${sourceId}`, serviceRole)
    const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: statusRows, error: statusError } = await admin.rpc('login_guard_status', {
      p_email: email,
      p_source_hash: sourceHash,
    })
    if (statusError) return json(req, { error: 'LOGIN_GUARD_UNAVAILABLE' }, 503)
    const current = Array.isArray(statusRows) ? statusRows[0] as { failure_count?: number; locked_until?: string | null } | undefined : undefined
    if (current?.locked_until && new Date(current.locked_until).getTime() > Date.now()) {
      return json(req, { error: 'SOURCE_LOCKED', locked_until: current.locked_until }, 429)
    }

    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { data, error } = await authClient.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) {
      // Count only credential rejections. Service errors and Auth throttles are not user failures.
      const status = Number((error as { status?: number } | null)?.status ?? 0)
      if (status === 400 || status === 401 || status === 422) {
        const { data: failureRows, error: failureError } = await admin.rpc('login_guard_record_failure', {
          p_email: email,
          p_source_hash: sourceHash,
        })
        if (failureError) return json(req, { error: 'LOGIN_GUARD_UNAVAILABLE' }, 503)
        const failure = Array.isArray(failureRows) ? failureRows[0] as { failure_count?: number; locked_until?: string | null } | undefined : undefined
        if (failure?.locked_until) return json(req, { error: 'SOURCE_LOCKED', locked_until: failure.locked_until }, 429)
        return json(req, { error: 'INVALID_CREDENTIALS', failures_left: Math.max(0, 10 - Number(failure?.failure_count ?? 0)) }, 401)
      }
      if (status === 429) return json(req, { error: 'AUTH_THROTTLED' }, 429)
      return json(req, { error: 'AUTH_UNAVAILABLE' }, 503)
    }

    const { error: clearError } = await admin.rpc('login_guard_record_success', {
      p_email: email,
      p_source_hash: sourceHash,
    })
    if (clearError) {
      await authClient.auth.signOut()
      return json(req, { error: 'LOGIN_GUARD_UNAVAILABLE' }, 503)
    }

    // The access/refresh tokens are returned only to the caller so the existing
    // Supabase client can persist the session exactly as it does today.
    return json(req, { session: data.session })
  } catch {
    // Never log request bodies or passwords.
    return json(req, { error: 'INTERNAL' }, 500)
  }
})
