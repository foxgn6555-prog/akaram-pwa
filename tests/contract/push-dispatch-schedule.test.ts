/**
 * 00407 — عقد «إرسال إشعارات الهاتف مجدول ولا يعتمد على فتح التطبيق».
 *
 * العيب المؤكَّد: ٠ اشتراك · ٠ إرسال · ولا مهمة pg_cron تنادي notification-push-dispatch،
 * والإرسال كان يُستدعى من المتصفح بنطاق self فقط. ويُضاف: مفتاح VAPID في .env.local يجب أن
 * يطابق المفتاح العام في الخادم (كان مختلفًا ⇒ أول اشتراك يفشل إرساله).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const sql = readFileSync(join(ROOT, 'supabase/migrations/00407_push_dispatch_schedule.sql'), 'utf8')
const dispatch = readFileSync(join(ROOT, 'supabase/functions/notification-push-dispatch/index.ts'), 'utf8')
const banner = readFileSync(join(ROOT, 'src/features/notifications/components/PushEnableBanner.tsx'), 'utf8')
const dropdown = readFileSync(join(ROOT, 'src/features/notifications/components/NotificationDropdown.tsx'), 'utf8')

describe('00407 — جدولة Push', () => {
  it('مهمة كل دقيقة تنادي الدالة بمفتاح الخدمة من الخزنة (لا مفتاح مكتوب في SQL)', () => {
    expect(sql).toContain("cron.schedule(\n  'notification-push-dispatch-minute'")
    expect(sql).toContain("'* * * * *'")
    expect(sql).toContain('/functions/v1/notification-push-dispatch')
    expect(sql).toContain("vault.decrypted_secrets where name = 'edge_service_role'")
    expect(sql).toContain(`'{"scope":"all"}'::jsonb`)
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
    expect(sql).toContain('cron.unschedule')
  })

  it('الدالة تمنح نطاق «الكل» لتوكن الخدمة فقط', () => {
    expect(dispatch).toContain('if (token !== serviceKey)')
    expect(dispatch).toContain("scope: userId ? 'self' : 'all'")
    const idxService = dispatch.indexOf('if (token !== serviceKey)')
    const idxUser = dispatch.indexOf('userId = data.user.id')
    expect(idxUser).toBeGreaterThan(idxService) // النطاق العام لا يُمنح إلا بعد التحقق من الخدمة
  })

  it('زر التفعيل ظاهر في مركز الإشعارات لا مدفونًا في الإعدادات', () => {
    expect(dropdown).toContain('<PushEnableBanner />')
    expect(dropdown).toContain('!settings && <PushEnableBanner />')
    expect(banner).toContain('data-testid="push-enable-now"')
    expect(banner).toContain('data-testid="push-enable-banner"')
    expect(banner).toContain("if (enabled !== false || !support.supported) return null")
  })
})
