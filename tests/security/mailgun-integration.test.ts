import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const inbound = readFileSync('supabase/functions/mailgun-inbound/index.ts', 'utf8')
const attachmentUtils = readFileSync('supabase/functions/_shared/attachment-utils.ts', 'utf8')
const outbound = readFileSync('supabase/functions/mailgun-send/index.ts', 'utf8')
const events = readFileSync('supabase/functions/mailgun-events/index.ts', 'utf8')
const config = readFileSync('supabase/config.toml', 'utf8')

describe('عقد أمان تكامل Mailgun', () => {
  it('الوارد وأحداث التسليم يتحققان من توقيع Mailgun', () => {
    expect(inbound).toContain('verifyMailgunSignature')
    expect(events).toContain('verifyMailgunSignature')
    expect(inbound).toContain('MAILGUN_WEBHOOK_SIGNING_KEY')
  })

  it('الإرسال يتحقق من JWT والدور ولا يقرأ API key من العميل', () => {
    expect(outbound).toContain('admin.auth.getUser(jwt)')
    expect(outbound).toContain("['complaints_officer', 'super_admin']")
    expect(outbound).toContain("Deno.env.get('MAILGUN_API_KEY')")
    expect(outbound).not.toContain('VITE_MAILGUN')
  })

  it('تعطيل JWT محصور في webhooks الموقعة والإرسال محمي', () => {
    expect(config).toContain('[functions.mailgun-inbound]\nverify_jwt = false')
    expect(config).toContain('[functions.mailgun-events]\nverify_jwt = false')
    expect(config).toContain('[functions.mailgun-send]\nverify_jwt = true')
  })

  it('الوارد يطبق منع التكرار وحدود الملفات', () => {
    expect(inbound).toContain(".eq('internet_message_id', messageId)")
    expect(inbound).toContain('maxAttachmentBytes')
    expect(inbound).toContain('maxMessageAttachmentBytes')
    expect(inbound).not.toContain('maxAttachmentCount')
    expect(inbound).not.toContain('ATTACHMENT_COUNT_REJECTED')
    expect(inbound).toContain('ATTACHMENT_TOTAL_REJECTED')
    expect(inbound).toContain("digest('SHA-256'")
  })

  it('يكشف نقص المرفقات ويسجل المعلن والمستلم والمخزن ويعالج بتوازٍ محدود', () => {
    expect(inbound).toContain('ATTACHMENT_COUNT_MISMATCH')
    expect(inbound).toContain('ATTACHMENT_IMPORT_INCOMPLETE')
    expect(inbound).toContain('attachment_declared')
    expect(inbound).toContain('attachment_received')
    expect(inbound).toContain('attachment_stored')
    expect(inbound).toContain('mapConcurrent(attachments, 4')
    expect(attachmentUtils).toContain('if(firstError)throw firstError')
    expect(inbound).toContain('attachmentMime(file, bytes)')
    expect(inbound).toContain('ATTACHMENT_CONTENT_REJECTED')
    expect(inbound).toContain("existing.import_status !== 'failed'")
    expect(inbound).toContain('extractionStale')
    expect(inbound).toContain('100 * 1024 * 1024')
  })
})
