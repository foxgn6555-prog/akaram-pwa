/** Employee login-support inbox. Public threads use a high-entropy bearer ticket token;
 * administrative actions require a live JWT and the it_admin role. */
import { createClient } from 'npm:@supabase/supabase-js@2'

type Body = Record<string, unknown>
type AdminClient = ReturnType<typeof createClient>
type Responder = (body: Record<string, unknown>, status?: number) => Response
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,http://localhost:3000,https://akram.example.iq,https://arena.ai').split(',').map((value) => value.trim())
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max)

function headersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const preview = /^https:\/\/[0-9]+-[a-z0-9-]+\.e2b\.app$/i.test(origin)
  const allowed = ALLOWED_ORIGINS.includes(origin) || preview
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
  }
}
function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin') ?? ''
  if (req.method === 'OPTIONS') return new Response('ok', { headers: headersFor(req) })
  if (origin && !headersFor(req)['Access-Control-Allow-Origin']) return new Response('Origin not allowed', { status: 403 })
  return null
}
function responder(req: Request): Responder {
  return (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headersFor(req), 'Content-Type': 'application/json' } })
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req)
  if (preflight) return preflight
  const reply = responder(req)
  if (req.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceRole) return reply({ error: 'CONFIGURATION' }, 503)
    const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
    const body = await req.json().catch(() => null) as Body | null
    if (!body) return reply({ error: 'INVALID_INPUT' }, 400)
    const action = clean(body.action, 40)

    if (action === 'public_settings') return await publicSettings(admin, reply)
    if (action === 'start_request') return await startRequest(admin, body, reply)
    if (action === 'load_thread') return await loadThread(admin, body, reply)
    if (action === 'send_message') return await sendPublicMessage(admin, body, reply)

    const callerId = await requireItAdmin(admin, req.headers.get('Authorization'))
    if (!callerId) return reply({ error: 'FORBIDDEN' }, 403)
    if (action === 'list_requests') return await listRequests(admin, reply)
    if (action === 'get_request') return await getRequest(admin, body, reply)
    if (action === 'send_reply') return await sendReply(admin, callerId, body, reply)
    if (action === 'set_status') return await setStatus(admin, callerId, body, reply)
    if (action === 'get_settings') return await publicSettings(admin, reply)
    if (action === 'set_settings') return await setSettings(admin, callerId, body, reply)
    if (action === 'list_locks') return await listLocks(admin, reply)
    if (action === 'unlock_email') return await unlockEmail(admin, callerId, body, reply)
    if (action === 'lookup_employee') return await lookupEmployee(admin, body, reply)
    return reply({ error: 'BAD_ACTION' }, 400)
  } catch {
    // Do not log user-supplied text, ticket tokens, or credentials.
    return reply({ error: 'INTERNAL' }, 500)
  }
})

async function requireItAdmin(admin: AdminClient, authHeader: string | null): Promise<string | null> {
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: roles, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', data.user.id)
  if (roleError || !(roles ?? []).some((row: { role: string }) => row.role === 'it_admin')) return null
  return data.user.id
}

async function publicSettings(admin: AdminClient, reply: Responder): Promise<Response> {
  const { data, error } = await admin.from('login_support_settings').select('support_phone,business_hours,is_online').eq('id', true).maybeSingle()
  if (error) return reply({ error: 'SETTINGS_UNAVAILABLE' }, 503)
  return reply({ settings: data ?? { support_phone: null, business_hours: null, is_online: false } })
}

async function startRequest(admin: AdminClient, body: Body, reply: Responder): Promise<Response> {
  const email = clean(body.email, 254).toLowerCase()
  const employeeNumber = clean(body.employee_number, 40)
  const employeeName = clean(body.employee_name, 120)
  const message = clean(body.message, 2000)
  if (!EMAIL_RE.test(email) || !employeeNumber || employeeName.length < 2 || !message) return reply({ error: 'INVALID_INPUT' }, 400)
  const { count, error: countError } = await admin.from('login_support_requests').select('id', { count: 'exact', head: true }).eq('employee_email', email).gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
  if (countError) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  if ((count ?? 0) >= 3) return reply({ error: 'RATE_LIMITED' }, 429)

  const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll('-', '')}`
  const id = crypto.randomUUID()
  const reference = `IT-${id.slice(0, 8).toUpperCase()}`
  const { error: insertError } = await admin.from('login_support_requests').insert({
    id, reference, employee_email: email, employee_number: employeeNumber, employee_name: employeeName,
    access_token_hash: await sha256(token), status: 'open',
  })
  if (insertError) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  const { error: messageError } = await admin.from('login_support_messages').insert({ request_id: id, sender: 'employee', body: message })
  if (messageError) {
    await admin.from('login_support_requests').delete().eq('id', id)
    return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  }
  return reply({ ticket: { id, reference, status: 'open' }, token })
}

async function validTicket(admin: AdminClient, body: Body) {
  const id = clean(body.ticket_id, 50)
  const token = clean(body.token, 150)
  if (!UUID_RE.test(id) || token.length < 40 || token.length > 150) return null
  const { data, error } = await admin.from('login_support_requests').select('id,status,reference,access_token_hash').eq('id', id).maybeSingle()
  if (error || !data || data.access_token_hash !== await sha256(token)) return null
  return data as { id: string; status: string; reference: string; access_token_hash: string }
}

async function loadThread(admin: AdminClient, body: Body, reply: Responder): Promise<Response> {
  const ticket = await validTicket(admin, body)
  if (!ticket) return reply({ error: 'NOT_FOUND' }, 404)
  const { data, error } = await admin.from('login_support_messages').select('id,sender,body,created_at').eq('request_id', ticket.id).order('created_at', { ascending: true }).limit(200)
  if (error) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  return reply({ ticket: { id: ticket.id, reference: ticket.reference, status: ticket.status }, messages: data ?? [] })
}

async function sendPublicMessage(admin: AdminClient, body: Body, reply: Responder): Promise<Response> {
  const ticket = await validTicket(admin, body)
  if (!ticket) return reply({ error: 'NOT_FOUND' }, 404)
  if (ticket.status === 'resolved') return reply({ error: 'RESOLVED' }, 409)
  const message = clean(body.message, 2000)
  if (!message) return reply({ error: 'INVALID_INPUT' }, 400)
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count, error: countError } = await admin.from('login_support_messages').select('id', { count: 'exact', head: true }).eq('request_id', ticket.id).eq('sender', 'employee').gte('created_at', since)
  if (countError) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  if ((count ?? 0) >= 20) return reply({ error: 'RATE_LIMITED' }, 429)
  const { error } = await admin.from('login_support_messages').insert({ request_id: ticket.id, sender: 'employee', body: message })
  if (error) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  const now = new Date().toISOString()
  await admin.from('login_support_requests').update({ status: 'open', last_message_at: now, updated_at: now }).eq('id', ticket.id)
  return reply({ ok: true })
}

async function listRequests(admin: AdminClient, reply: Responder): Promise<Response> {
  const { data, error } = await admin.from('login_support_requests').select('id,reference,employee_email,employee_number,employee_name,status,created_at,updated_at,last_message_at,resolved_at').order('last_message_at', { ascending: false }).limit(100)
  if (error) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  return reply({ requests: data ?? [] })
}

async function getRequest(admin: AdminClient, body: Body, reply: Responder): Promise<Response> {
  const id = clean(body.ticket_id, 50)
  if (!UUID_RE.test(id)) return reply({ error: 'INVALID_INPUT' }, 400)
  const { data: ticket, error } = await admin.from('login_support_requests').select('id,reference,employee_email,employee_number,employee_name,status,created_at,updated_at,last_message_at,resolved_at').eq('id', id).maybeSingle()
  if (error || !ticket) return reply({ error: 'NOT_FOUND' }, 404)
  const { data: messages, error: messagesError } = await admin.from('login_support_messages').select('id,sender,body,created_at').eq('request_id', id).order('created_at', { ascending: true }).limit(200)
  if (messagesError) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  return reply({ ticket, messages: messages ?? [] })
}

async function sendReply(admin: AdminClient, callerId: string, body: Body, reply: Responder): Promise<Response> {
  const id = clean(body.ticket_id, 50)
  const message = clean(body.message, 2000)
  if (!UUID_RE.test(id) || !message) return reply({ error: 'INVALID_INPUT' }, 400)
  const { data: ticket, error: ticketError } = await admin.from('login_support_requests').select('id,status').eq('id', id).maybeSingle()
  if (ticketError || !ticket) return reply({ error: 'NOT_FOUND' }, 404)
  if (ticket.status === 'resolved') return reply({ error: 'RESOLVED' }, 409)
  const { error } = await admin.from('login_support_messages').insert({ request_id: id, sender: 'support', body: message })
  if (error) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  const now = new Date().toISOString()
  await admin.from('login_support_requests').update({ status: 'waiting', last_message_at: now, updated_at: now }).eq('id', id)
  await audit(admin, callerId, 'reply', id, { message_length: message.length })
  return reply({ ok: true })
}

async function setStatus(admin: AdminClient, callerId: string, body: Body, reply: Responder): Promise<Response> {
  const id = clean(body.ticket_id, 50)
  const status = clean(body.status, 20)
  if (!UUID_RE.test(id) || !['open', 'waiting', 'resolved'].includes(status)) return reply({ error: 'INVALID_INPUT' }, 400)
  const now = new Date().toISOString()
  const { error } = await admin.from('login_support_requests').update({ status, updated_at: now, resolved_at: status === 'resolved' ? now : null }).eq('id', id)
  if (error) return reply({ error: 'SUPPORT_UNAVAILABLE' }, 503)
  await audit(admin, callerId, 'status', id, { status })
  return reply({ ok: true })
}

async function setSettings(admin: AdminClient, callerId: string, body: Body, reply: Responder): Promise<Response> {
  const phone = clean(body.support_phone, 40) || null
  const hours = clean(body.business_hours, 120) || null
  const isOnline = body.is_online === true
  if (phone && !/^[+0-9()\s.-]{5,40}$/.test(phone)) return reply({ error: 'INVALID_PHONE' }, 400)
  const { error } = await admin.from('login_support_settings').upsert({ id: true, support_phone: phone, business_hours: hours, is_online: isOnline, updated_by: callerId, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (error) return reply({ error: 'SETTINGS_UNAVAILABLE' }, 503)
  await audit(admin, callerId, 'settings', 'login_support_settings', { is_online: isOnline, phone_configured: Boolean(phone) })
  return await publicSettings(admin, reply)
}

async function listLocks(admin: AdminClient, reply: Responder): Promise<Response> {
  const { data, error } = await admin.from('login_source_locks').select('normalized_email,failure_count,window_started_at,locked_until,updated_at').gt('locked_until', new Date().toISOString()).order('locked_until', { ascending: true }).limit(500)
  if (error) return reply({ error: 'LOCKS_UNAVAILABLE' }, 503)
  return reply({ locks: data ?? [] })
}

async function unlockEmail(admin: AdminClient, callerId: string, body: Body, reply: Responder): Promise<Response> {
  const email = clean(body.email, 254).toLowerCase()
  if (!EMAIL_RE.test(email)) return reply({ error: 'INVALID_INPUT' }, 400)
  const { data, error } = await admin.from('login_source_locks').delete().eq('normalized_email', email).select('source_hash')
  if (error) return reply({ error: 'LOCKS_UNAVAILABLE' }, 503)
  const affected = data?.length ?? 0
  await audit(admin, callerId, 'unlock', email, { affected_sources: affected })
  return reply({ ok: true, affected_sources: affected })
}

async function lookupEmployee(admin: AdminClient, body: Body, reply: Responder): Promise<Response> {
  const email = clean(body.email, 254).toLowerCase()
  if (!EMAIL_RE.test(email)) return reply({ error: 'INVALID_INPUT' }, 400)
  const { data, error } = await admin.from('employees').select('user_id,employee_number,full_name,email,phone').eq('email', email).is('archived_at', null).maybeSingle()
  if (error) return reply({ error: 'LOOKUP_UNAVAILABLE' }, 503)
  if (!data?.user_id) return reply({ error: 'EMPLOYEE_NOT_FOUND' }, 404)
  return reply({ employee: { user_id: data.user_id, employee_number: data.employee_number, full_name: data.full_name, email: data.email, registered_phone: data.phone } })
}

async function audit(admin: AdminClient, actorId: string, action: string, recordId: string, detail: Record<string, unknown>): Promise<void> {
  await admin.from('audit_logs').insert({ table_name: 'login_support', record_id: recordId, operation: 'UPDATE', new_row: { action, ...detail }, actor_id: actorId, actor_role: 'edge:login-support' })
}
