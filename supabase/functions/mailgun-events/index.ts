import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, verifyMailgunSignature } from '../_shared/mailgun.ts'

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)
  try {
    const payload = await request.json() as Record<string, unknown>
    const signature = (payload.signature ?? {}) as Record<string, unknown>
    const valid = await verifyMailgunSignature(
      String(signature.timestamp ?? ''), String(signature.token ?? ''),
      String(signature.signature ?? ''), Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY') ?? '',
    )
    if (!valid) return jsonResponse({ error: 'INVALID_SIGNATURE' }, 401)

    const event = (payload['event-data'] ?? {}) as Record<string, unknown>
    const message = (event.message ?? {}) as Record<string, unknown>
    const headers = (message.headers ?? {}) as Record<string, unknown>
    const variables = (event['user-variables'] ?? {}) as Record<string, unknown>
    const providerMessageId = String(headers['message-id'] ?? '')
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    let deliveryId = String(variables.delivery_id ?? '')
    if (!deliveryId && providerMessageId) {
      const { data } = await admin.from('complaint_email_deliveries')
        .select('id').eq('provider_message_id', providerMessageId).maybeSingle()
      deliveryId = data?.id ?? ''
    }
    if (!deliveryId) return jsonResponse({ ok: true, ignored: true })

    const eventType = String(event.event ?? 'unknown')
    const severity = event.severity ? String(event.severity) : null
    const status = eventType === 'delivered' ? 'delivered'
      : eventType === 'failed' && severity === 'permanent' ? 'permanent_failure'
      : eventType === 'failed' ? 'temporary_failure'
      : eventType === 'accepted' ? 'accepted' : null
    const eventAt = new Date(Number(event.timestamp ?? Date.now() / 1000) * 1000).toISOString()

    await admin.from('complaint_email_events').upsert({
      delivery_id: deliveryId,
      provider_event_id: String(event.id ?? `${eventType}:${signature.token}`),
      event_type: eventType,
      severity,
      recipient: event.recipient ? String(event.recipient) : null,
      event_at: eventAt,
      payload: event,
    }, { onConflict: 'provider_event_id', ignoreDuplicates: true })

    if (status) {
      await admin.from('complaint_email_deliveries').update({
        status,
        delivered_at: status === 'delivered' ? eventAt : null,
        error_message: status.includes('failure') ? String(event.reason ?? 'فشل التسليم').slice(0, 1000) : null,
      }).eq('id', deliveryId)
    }
    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('mailgun-events failed', error instanceof Error ? error.message : 'unknown')
    return jsonResponse({ error: 'EVENT_PROCESSING_FAILED' }, 500)
  }
})
