import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const maxTotalBytes = 24 * 1024 * 1024

Deno.serve(async (request: Request) => {
  const cors = handleCors(request)
  if (cors) return cors
  if (request.method !== 'POST') return reply({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = request.headers.get('Authorization') ?? ''
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  try {
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    const { data: userData, error: userError } = await admin.auth.getUser(jwt)
    if (userError || !userData.user) return reply({ error: 'UNAUTHORIZED' }, 401)
    const userId = userData.user.id
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userId)
    if (!(roles ?? []).some((row: { role: string }) => ['complaints_officer', 'super_admin'].includes(row.role))) {
      return reply({ error: 'FORBIDDEN' }, 403)
    }

    const body = await request.json() as Record<string, unknown>
    const recipients = Array.isArray(body.to)
      ? body.to.map(String).map((email) => email.trim().toLowerCase()).filter(Boolean)
      : []
    const subject = String(body.subject ?? '').trim()
    const text = String(body.text ?? '').trim()
    const complaintId = body.complaintId ? String(body.complaintId) : null
    const reportId = body.reportId ? String(body.reportId) : null
    const attachmentPaths = Array.isArray(body.attachmentPaths) ? body.attachmentPaths.map(String) : []
    if (!recipients.length || recipients.some((email) => !emailPattern.test(email))) {
      return reply({ error: 'INVALID_RECIPIENTS' }, 400)
    }
    if (!subject || !text) return reply({ error: 'SUBJECT_AND_TEXT_REQUIRED' }, 400)
    if (recipients.length > 20) return reply({ error: 'TOO_MANY_RECIPIENTS' }, 400)
    if (attachmentPaths.some((path) => !path.startsWith('reports/'))) {
      return reply({ error: 'INVALID_ATTACHMENT_PATH' }, 400)
    }
    if (reportId) {
      const { data: approvedReport, error: approvedError } = await admin.from('complaint_reports')
        .select('id,pptx_path,status').eq('id', reportId).in('status', ['approved', 'failed']).single()
      if (approvedError || !approvedReport) return reply({ error: 'REPORT_NOT_APPROVED' }, 409)
      if (!approvedReport.pptx_path || attachmentPaths.length !== 1 || attachmentPaths[0] !== approvedReport.pptx_path) {
        return reply({ error: 'REPORT_ATTACHMENT_MISMATCH' }, 400)
      }
    }

    const domain = Deno.env.get('MAILGUN_DOMAIN')!
    const apiKey = Deno.env.get('MAILGUN_API_KEY')!
    const sender = Deno.env.get('MAILGUN_FROM')!
    const apiBase = Deno.env.get('MAILGUN_API_BASE') ?? 'https://api.mailgun.net'
    if (!domain || !apiKey || !sender) throw new Error('MAILGUN_SECRETS_MISSING')

    const attachments: Array<{ path: string; file: Blob }> = []
    let totalBytes = 0
    for (const path of attachmentPaths) {
      const { data: file, error: downloadError } = await admin.storage.from('complaint-media').download(path)
      if (downloadError || !file) return reply({ error: 'ATTACHMENT_DOWNLOAD_FAILED' }, 400)
      totalBytes += file.size
      if (totalBytes > maxTotalBytes) return reply({ error: 'ATTACHMENTS_TOO_LARGE' }, 413)
      attachments.push({ path, file })
    }

    const { data: delivery, error: insertError } = await admin.from('complaint_email_deliveries').insert({
      complaint_id: complaintId, report_id: reportId, sender, recipients, subject, attachment_paths: attachmentPaths,
      status: 'queued', sent_by: userId,
    }).select('id').single()
    if (insertError || !delivery) throw insertError ?? new Error('DELIVERY_LOG_FAILED')
    if (reportId) {
      const { error: reportError } = await admin.from('complaint_reports').update({
        delivery_id: delivery.id, status: 'sending', recipients,
      }).eq('id', reportId).in('status', ['approved', 'failed']).select('id').single()
      if (reportError) {
        await admin.from('complaint_email_deliveries').update({ status: 'rejected', error_message: 'REPORT_STATE_RACE' }).eq('id', delivery.id)
        return reply({ error: 'REPORT_NOT_APPROVED' }, 409)
      }
    }

    const form = new FormData()
    form.set('from', sender)
    for (const recipient of recipients) form.append('to', recipient)
    form.set('subject', subject)
    form.set('text', text)
    form.set('o:tag', 'complaints-report')
    form.set('v:delivery_id', delivery.id)

    for (const { path, file } of attachments) {
      form.append('attachment', file, path.split('/').pop() ?? 'report.pptx')
    }

    let response: Response
    try {
      response = await fetch(`${apiBase}/v3/${domain}/messages`, {
        method: 'POST', headers: { authorization: `Basic ${btoa(`api:${apiKey}`)}` }, body: form,
      })
    } catch {
      await admin.from('complaint_email_deliveries').update({ status: 'rejected', error_message: 'MAILGUN_NETWORK_ERROR' }).eq('id', delivery.id)
      if (reportId) await admin.from('complaint_reports').update({ status: 'failed' }).eq('id', reportId)
      return reply({ error: 'MAILGUN_SEND_FAILED' }, 502)
    }
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string }
    if (!response.ok || !result.id) {
      await admin.from('complaint_email_deliveries').update({
        status: 'rejected', error_message: String(result.message ?? `HTTP ${response.status}`).slice(0, 1000),
      }).eq('id', delivery.id)
      if (reportId) await admin.from('complaint_reports').update({ status: 'failed' }).eq('id', reportId)
      return reply({ error: 'MAILGUN_SEND_FAILED' }, 502)
    }

    await admin.from('complaint_email_deliveries').update({
      status: 'accepted', provider_message_id: result.id, accepted_at: new Date().toISOString(),
    }).eq('id', delivery.id)
    return reply({ ok: true, deliveryId: delivery.id, providerMessageId: result.id })
  } catch (error) {
    console.error('mailgun-send failed', error instanceof Error ? error.message : 'unknown')
    return reply({ error: 'SEND_FAILED' }, 500)
  }
})

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
  })
}
