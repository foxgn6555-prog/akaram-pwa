/** 00380 — عقد مستودع GPS: لا مفاتيح في الشيفرة، الدالة تتحقق من الدور، المستودع خادم فقط، والهجرة لا تُعرّض الجداول */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const fn = readFileSync('supabase/functions/gps-warehouse/index.ts', 'utf8')
const wh = readFileSync('gps-warehouse/supabase/migrations/0001_warehouse_schema.sql', 'utf8')
const main = readFileSync('supabase/migrations/00324_gps_warehouse_link.sql', 'utf8')
const all = [fn, wh, main, readFileSync('src/services/gps-warehouse.sdk.ts', 'utf8'), readFileSync('src/features/gps-warehouse/GpsWarehouseCard.tsx', 'utf8'), readFileSync('gps-warehouse/supabase/config.toml', 'utf8')].join('\n')

describe('gps-warehouse contract (00380)', () => {
  it('لا مفتاح سرّي أو JWT مضمّن في أي ملف', () => {
    expect(all).not.toMatch(/sb_secret_[A-Za-z0-9]{8,}/)
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./)
  })
  it('دالة الحافة: الأسرار من البيئة، 403 بلا دور، الفحص للعمليات/IT والكتابة لـ IT فقط، وتسجيل النتيجة في المشروع الأول', () => {
    expect(fn).toContain("Deno.env.get('GPS_WAREHOUSE_URL')"); expect(fn).toContain("Deno.env.get('GPS_WAREHOUSE_SERVICE_KEY')")
    expect(fn).toContain("'GPS_WAREHOUSE_FORBIDDEN' }, 403")
    expect(fn).toContain("READ_ROLES = ['ops_room', 'it_admin', 'super_admin'], WRITE_ROLES = ['it_admin', 'super_admin']")
    expect(fn).toContain("admin.rpc('gps_warehouse_link_record'")
    expect(fn).toContain("'wh_ping'"); expect(fn).toContain("'wh_upsert_vehicles'"); expect(fn).toContain("'wh_enqueue_month'")
    expect(fn).toContain('GPS_WAREHOUSE_NOT_CONFIGURED')
  })
  it('هجرة المستودع: RLS على كل جدول wh_ وسحب الصلاحيات، وبلا سياسات', () => {
    expect(wh).toMatch(/enable row level security/); expect(wh).toContain('revoke all on table public.%I from anon, authenticated')
    expect(wh).not.toMatch(/create policy/)
    expect(wh).toContain('revoke all on function public.wh_ping(), public.wh_upsert_vehicles(jsonb), public.wh_enqueue_month(date) from public, anon, authenticated')
    expect(wh).toContain("min_stop_minutes int not null default 10"); expect(wh).toContain("max_stop_minutes int not null default 120"); expect(wh).toContain("fault_stop_hours int not null default 24")
  })
  it('المشروع الأول: جدول الحالة بلا أعمدة مفاتيح، والتسجيل للخدمة فقط', () => {
    const mainCode = main.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(mainCode).not.toMatch(/service_key|secret|token|api_key/i)
    expect(main).toContain("if auth.role() <> 'service_role' then raise exception 'GPS_FORBIDDEN'")
  })
})
