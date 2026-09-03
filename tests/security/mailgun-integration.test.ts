import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const inbound = readFileSync('supabase/functions/mailgun-inbound/index.ts', 'utf8')
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
    expect(inbound).toContain("digest('SHA-256'")
  })
})
