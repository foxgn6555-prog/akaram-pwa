import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.114.0'
import webpush from 'npm:web-push@3.6.7'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
type Delivery = {
  delivery_id: string
  notification_id: string
  subscription_id: string
  endpoint: string
  p256dh: string
  auth_key: string
  title: string
  body: string
  link: string
  priority: string
  category: string
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
Deno.serve(async (req) => {
  const preflight = handleCors(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const url = Deno.env.get('SUPABASE_URL'),
      serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      publicKey = Deno.env.get('VAPID_PUBLIC_KEY'),
      privateKey = Deno.env.get('VAPID_PRIVATE_KEY'),
      subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.iq'
    if (!url || !serviceKey || !publicKey || !privateKey)
      throw new Error('PUSH_SERVER_NOT_CONFIGURED')
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'UNAUTHORIZED' }, 401)
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    let userId: string | null = null
    if (token !== serviceKey) {
      const authClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey, {
          auth: { persistSession: false },
        }),
        { data, error } = await authClient.auth.getUser(token)
      if (error || !data.user) return json({ error: 'UNAUTHORIZED' }, 401)
      userId = data.user.id
    }
    webpush.setVapidDetails(subject, publicKey, privateKey)
    const { error: escalationError } = await admin.rpc('notification_evaluate_workflow_escalations')
    if (escalationError) throw new Error(`PUSH_ESCALATION_FAILED:${escalationError.code ?? 'DB'}`)
    const { error: gpsEscalationError } = await admin.rpc('notification_evaluate_gps_escalations')
    if (gpsEscalationError)
      throw new Error(`PUSH_GPS_ESCALATION_FAILED:${gpsEscalationError.code ?? 'DB'}`)
    const { data, error } = await admin.rpc('notification_claim_push', {
      p_limit: 50,
      p_user_id: userId,
    })
    if (error) throw new Error(`PUSH_CLAIM_FAILED:${error.code ?? 'DB'}`)
    const rows = (data ?? []) as Delivery[]
    let sent = 0,
      failed = 0
    for (const row of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
          JSON.stringify({
            title: row.title,
            body: row.body,
            link: row.link,
            priority: row.priority,
            category: row.category,
            notificationId: row.notification_id,
            deliveryId: row.delivery_id,
          }),
          {
            TTL: row.priority === 'critical' ? 86400 : 14400,
            urgency: row.priority === 'critical' ? 'high' : 'normal',
          },
        )
        await admin.rpc('notification_finish_push', {
          p_delivery_id: row.delivery_id,
          p_success: true,
          p_http_status: 201,
          p_error: null,
          p_permanent: false,
        })
        sent++
      } catch (cause) {
        const x = cause as { statusCode?: number; message?: string }
        const permanent = x.statusCode === 404 || x.statusCode === 410
        await admin.rpc('notification_finish_push', {
          p_delivery_id: row.delivery_id,
          p_success: false,
          p_http_status: x.statusCode ?? null,
          p_error: x.message ?? 'PUSH_DELIVERY_FAILED',
          p_permanent: permanent,
        })
        failed++
      }
    }
    return json({ ok: true, claimed: rows.length, sent, failed, scope: userId ? 'self' : 'all' })
  } catch (cause) {
    console.error(
      '[notification-push-dispatch]',
      cause instanceof Error ? cause.message : 'UNKNOWN',
    )
    return json({ error: 'PUSH_DISPATCH_FAILED' }, 500)
  }
})
