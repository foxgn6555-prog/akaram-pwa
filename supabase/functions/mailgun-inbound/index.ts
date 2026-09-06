import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, safeFileName, verifyMailgunSignature } from '../_shared/mailgun.ts'
import { attachmentMime, mapConcurrent } from '../_shared/attachment-utils.ts'

const allowedMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const maxAttachmentBytes = 25 * 1024 * 1024
const maxMessageAttachmentBytes = 100 * 1024 * 1024
const maxAttachmentCount = 100


Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405)
  let failedMessageId: string | null = null

  try {
    const form = await request.formData()
    const timestamp = String(form.get('timestamp') ?? '')
    const token = String(form.get('token') ?? '')
    const signature = String(form.get('signature') ?? '')
    const signingKey = Deno.env.get('MAILGUN_WEBHOOK_SIGNING_KEY') ?? ''
    if (!signingKey || !(await verifyMailgunSignature(timestamp, token, signature, signingKey))) {
      return jsonResponse({ error: 'INVALID_SIGNATURE' }, 401)
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const sender = String(form.get('sender') ?? '').trim().toLowerCase()
    const recipient = String(form.get('recipient') ?? '').trim().toLowerCase()
    const messageId = String(form.get('Message-Id') ?? form.get('message-id') ?? `mailgun:${token}`)
    const declaredAttachmentCount = Number(form.get('attachment-count') ?? 0)
    const { data: rules } = await admin.from('complaint_sender_rules')
      .select('sender_pattern,sector').eq('is_active', true)
    const matchedRule = (rules ?? []).find((rule: { sender_pattern: string }) =>
      sender === rule.sender_pattern.toLowerCase()) as { sector: 'karrada' | 'zaafaraniya' } | undefined
    const sector = recipient.includes('karrada') ? 'karrada'
      : recipient.includes('zaafaraniya') ? 'zaafaraniya'
      : matchedRule?.sector ?? null

    const { data: existing } = await admin.from('complaint_inbox_messages')
      .select('id,import_status,updated_at').eq('internet_message_id', messageId).maybeSingle()
    const extractionStale = existing?.import_status === 'extracting'
      && Date.now() - new Date(existing.updated_at).getTime() > 10 * 60 * 1000
    if (existing && existing.import_status !== 'failed' && !extractionStale) {
      return jsonResponse({ ok: true, duplicate: true, processing: existing.import_status === 'extracting', id: existing.id })
    }

    let messageRow = existing
    if (!messageRow) {
      const { data, error } = await admin.from('complaint_inbox_messages').insert({
        internet_message_id: messageId,
        sender_email: sender || 'unknown',
        sender_name: String(form.get('from') ?? '').slice(0, 300) || null,
        reply_to: String(form.get('Reply-To') ?? sender) || null,
        recipients: recipient ? [recipient] : [],
        subject: String(form.get('subject') ?? '').slice(0, 998) || null,
        body_text: String(form.get('body-plain') ?? '').slice(0, 100_000) || null,
        source_sector: sector,
        received_at: new Date(Number(timestamp) * 1000).toISOString(),
        import_status: 'extracting',
        attachment_count: declaredAttachmentCount,
        raw_metadata: { provider: 'mailgun', recipient, attachment_declared: declaredAttachmentCount, stripped_text: String(form.get('stripped-text') ?? '').slice(0, 10_000) },
      }).select('id,import_status,updated_at').single()
      if (error || !data) throw error ?? new Error('INBOX_INSERT_FAILED')
      messageRow = data
    } else {
      await admin.from('complaint_inbox_messages').update({ import_status: 'extracting', error_message: null })
        .eq('id', messageRow.id)
    }

    if (!messageRow) throw new Error('INBOX_ROW_UNAVAILABLE')
    failedMessageId = messageRow.id
    const attachments = [...form.entries()]
      .filter(([key, value]) => key.startsWith('attachment-') && value instanceof File)
      .map(([key, value]) => ({ key, file: value as File }))
      .sort((a, b) => Number(a.key.replace(/\D/g, '')) - Number(b.key.replace(/\D/g, '')))
      .map(({ file }) => file)
    if (attachments.length > maxAttachmentCount) throw new Error(`ATTACHMENT_COUNT_REJECTED:${attachments.length}`)
    if (declaredAttachmentCount > 0 && declaredAttachmentCount !== attachments.length) {
      throw new Error(`ATTACHMENT_COUNT_MISMATCH:declared=${declaredAttachmentCount}:received=${attachments.length}`)
    }
    const totalAttachmentBytes = attachments.reduce((total, file) => total + file.size, 0)
    if (totalAttachmentBytes > maxMessageAttachmentBytes) throw new Error(`ATTACHMENT_TOTAL_REJECTED:${totalAttachmentBytes}`)
    await mapConcurrent(attachments, 4, async (file, index) => {
      if (file.size < 1 || file.size > maxAttachmentBytes) {
        throw new Error(`ATTACHMENT_REJECTED:${file.type}:${file.size}`)
      }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const mimeType = attachmentMime(file, bytes)
      if (!mimeType || !allowedMimeTypes.has(mimeType)) throw new Error(`ATTACHMENT_CONTENT_REJECTED:${file.name}`)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
      const path = `inbox/${messageRow.id}/${index + 1}-${hash}-${safeFileName(file.name)}`
      const { error: uploadError } = await admin.storage.from('complaint-media')
        .upload(path, bytes, { contentType: mimeType, upsert: true })
      if (uploadError) throw uploadError
      const { error: mediaError } = await admin.from('complaint_media').upsert({
        inbox_message_id: messageRow.id, media_kind: 'email_attachment', storage_path: path,
        original_name: file.name, mime_type: mimeType, size_bytes: file.size, sha256: hash, source: 'email',
      }, { onConflict: 'storage_path', ignoreDuplicates: true })
      if (mediaError) throw mediaError
    })

    const { count: importedCount, error: countError } = await admin.from('complaint_media')
      .select('id', { count: 'exact', head: true }).eq('inbox_message_id', messageRow.id).eq('media_kind', 'email_attachment')
    if (countError || importedCount !== attachments.length) {
      throw new Error(`ATTACHMENT_IMPORT_INCOMPLETE:received=${attachments.length}:stored=${importedCount ?? 0}`)
    }
    await admin.from('complaint_inbox_messages').update({
      import_status: sector ? 'ready' : 'needs_review', attachment_count: attachments.length,
      raw_metadata: { provider: 'mailgun', recipient, attachment_declared: declaredAttachmentCount,
        attachment_received: attachments.length, attachment_stored: importedCount, attachment_bytes: totalAttachmentBytes,
        stripped_text: String(form.get('stripped-text') ?? '').slice(0, 10_000) },
    }).eq('id', messageRow.id)
    return jsonResponse({ ok: true, id: messageRow.id, attachmentCount: importedCount, attachmentBytes: totalAttachmentBytes })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown'
    console.error('mailgun-inbound failed', message)
    if (failedMessageId) {
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false, autoRefreshToken: false } })
      await admin.from('complaint_inbox_messages').update({ import_status: 'failed', error_message: message.slice(0, 1000) })
        .eq('id', failedMessageId)
    }
    return jsonResponse({ error: 'INBOUND_PROCESSING_FAILED' }, 500)
  }
})
