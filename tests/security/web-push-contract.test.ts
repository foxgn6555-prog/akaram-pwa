import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const migration = readFileSync('supabase/migrations/00096_web_push_delivery.sql', 'utf8'),
  resilience = readFileSync(
    'supabase/migrations/00107_notification_delivery_resilience.sql',
    'utf8',
  ),
  operations = readFileSync(
    'supabase/migrations/00108_maintenance_timeline_and_push_operations.sql',
    'utf8',
  ),
  adminActions = readFileSync(
    'supabase/migrations/00109_push_admin_actions_and_timeline_access.sql',
    'utf8',
  ),
  metrics = readFileSync('supabase/migrations/00110_push_metrics_and_batch_retry.sql', 'utf8'),
  pushExport = readFileSync('src/features/notifications/export.ts', 'utf8'),
  worker = readFileSync('src/workers/sw.ts', 'utf8'),
  edge = readFileSync('supabase/functions/notification-push-dispatch/index.ts', 'utf8'),
  client = readFileSync('src/features/notifications/push.client.ts', 'utf8')
describe('عقد إشعارات Web Push', () => {
  it('يعزل الاشتراكات والطابور ويقصر التوزيع على service role', () => {
    expect(migration).toContain('enable row level security')
    expect(migration).toContain("raise exception'PUSH_SERVICE_ONLY'")
    expect(migration).toContain('p_permanent')
    expect(edge).toContain('statusCode === 404')
    expect(edge).toContain('statusCode === 410')
  })
  it('يعالج Push والنقر داخل Service Worker بروابط داخلية فقط', () => {
    expect(worker).toContain("addEventListener('push'")
    expect(worker).toContain("addEventListener('notificationclick'")
    expect(worker).toContain("startsWith('/')")
  })
  it('لا يكشف مفتاح VAPID الخاص للمتصفح', () => {
    expect(client).toContain('VITE_VAPID_PUBLIC_KEY')
    expect(client).not.toContain('VAPID_PRIVATE_KEY')
    expect(edge).toContain("Deno.env.get('VAPID_PRIVATE_KEY')")
  })
  it('يراعي فترة الهدوء مع مرور التنبيه الحرج فوراً', () => {
    expect(migration).toContain('notification_next_push_time')
    expect(migration).toContain("new.priority='critical'then now()")
    expect(edge).toContain('notification_evaluate_workflow_escalations')
  })
  it('يستعيد الإرسال المعلق ويتتبع النقرة والقراءة دون كشف مفاتيح الجهاز', () => {
    expect(resilience).toContain("claimed_at<now()-interval'5 minutes'")
    expect(resilience).toContain('notification_record_push_interaction')
    expect(resilience).toContain('s.user_id=auth.uid()')
    expect(resilience).toContain('notification_disable_push_device')
    expect(resilience).toContain('notification_delivery_operations')
    expect(resilience).toContain("app.has_role(array['it_admin','super_admin'])")
    expect(worker).toContain("searchParams.set('_push'")
    expect(client).toContain('recordPushInteractionFromLocation')
    expect(edge).toContain('deliveryId: row.delivery_id')
  })
  it('يعزل تفاصيل التسليم ويحذف منها مفاتيح الاشتراك', () => {
    expect(operations).toContain('notification_push_delivery_page')
    expect(operations).toContain("app.has_role(array['it_admin','super_admin'])")
    expect(operations).not.toMatch(/returns table\([^)]*(endpoint|p256dh|auth_key)/)
    expect(operations).toContain('p_limit not between 1 and 100')
    expect(operations).toContain('p_offset not between 0 and 10000')
  })
  it('يبني تسلسلاً موحداً وينبه الوصول والعودة الفعليين', () => {
    expect(operations).toContain('maintenance_case_events')
    expect(operations).toContain('trg_notify_maintenance_terminal_transitions')
    expect(operations).toContain("new.status='returned_to_work'")
    expect(operations).toContain("new.status='closed_at_garage'")
    expect(operations).toContain('c.completed_at is null')
    expect(operations).toContain('on conflict(user_id,dedupe_key)')
  })
  it('يحصر إعادة المحاولة والإلغاء وتعطيل الجهاز في التطوير ويسجل السبب والتدقيق', () => {
    expect(adminActions).toContain('notification_push_admin_action')
    expect(adminActions).toContain("app.has_role(array['it_admin','super_admin'])")
    expect(adminActions).toContain('notification_push_admin_actions')
    expect(adminActions).toContain('trg_audit_notification_push_admin_actions')
    expect(adminActions).toContain('length(trim(reason))between 3 and 500')
    expect(adminActions).not.toMatch(/returns table\([^)]*(endpoint|p256dh|auth_key)/)
  })
  it('يحسب الاتجاهات ويقيد الإعادة الجماعية بخمسين عملية مدققة', () => {
    expect(metrics).toContain('notification_push_metrics')
    expect(metrics).toContain('success_rate')
    expect(metrics).toContain('interaction_rate')
    expect(metrics).toContain('notification_push_batch_retry')
    expect(metrics).toContain('cardinality(p_delivery_ids)not between 1 and 50')
    expect(metrics).toContain('notification_push_admin_actions')
  })
  it('يصدر سجل Push بعبارات عربية دون بيانات الاشتراك', () => {
    expect(pushExport).toContain("workbook.addWorksheet('مراقبة Web Push'")
    expect(pushExport).toContain('بانتظار الإرسال')
    expect(pushExport).toContain('تم فتح الإشعار')
    expect(pushExport).not.toMatch(/p256dh|auth_key|subscription_id|endpoint/)
  })
  it('ينبه المسؤول والكراج بمراحل الصيانة مع منع التكرار', () => {
    expect(resilience).toContain('trg_notify_maintenance_case_progress')
    expect(resilience).toContain(
      "new.status not in('diagnosing','waiting_parts','in_repair','paused','ready')",
    )
    expect(resilience).toContain("role in('central_garage_officer','super_admin')")
    expect(resilience).toContain('on conflict(user_id,dedupe_key)')
  })
})
