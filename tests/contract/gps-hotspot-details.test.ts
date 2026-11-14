/**
 * 00405 — عقد «قائمة مخفّفة + تفاصيل عند الطلب».
 *
 * يمنع هذا الملف الانحدار إلى الحمولة القديمة (٢٫٨ م.ب لكل فتح للخريطة):
 * (أ) الخريطة تطلب details:false، (ب) دالة التفاصيل قائمة بصلاحياتها،
 * (ج) ساعة الذروة تصل نصياً في القائمة المخفّفة، (د) التصدير يجلب التفاصيل قبل بناء الملف.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const migration = read('supabase/migrations/00405_hotspot_details.sql')
const sdk = read('src/services/gps-hotspots.sdk.ts')
const hooks = read('src/features/gps-hotspots/hooks.ts')
const page = read('src/portals/ops-room/pages/WasteMap/OpsWasteMapPage.tsx')

describe('00405 — تفاصيل البقعة عند الطلب', () => {
  it('قاعدة البيانات: معامل p_details (الافتراضي true) + دالة تفاصيل بصلاحيات محمية', () => {
    expect(migration).toMatch(/p_details boolean default true/)
    expect(migration).toContain("(r - 'vehicles' - 'days' - 'hours')")
    expect(migration).toContain("jsonb_build_object('peak_hour'")
    expect(migration).toContain('create or replace function public.gps_hotspots_details(p_ids bigint[])')
    expect(migration).toContain("app.has_role(array['ops_room','deputy_director','executive_director','it_admin','super_admin'])")
    expect(migration).toContain('drop function if exists public.gps_hotspots_list(date, text[], text[], integer, integer[])')
  })

  it('الـ SDK والخطّافات: p_details يُرسل، والقائمة على الخريطة بلا حقول ثقيلة', () => {
    expect(sdk).toContain('p_details: f.details ?? true')
    expect(sdk).toContain("supabase.rpc('gps_hotspots_details'")
    expect(hooks).toContain('details: false')
    expect(hooks).toContain('useGpsHotspotDetail')
  })

  it('الصفحة: اللوحة تُغذّى بالتفاصيل، والتصدير يجلبها مرة واحدة', () => {
    expect(page).toContain('useGpsHotspotDetail(selected)')
    expect(page).toContain('detail={detailQ.data}')
    expect(page).toContain('async function withFullDetails')
    expect(page).toContain('gpsHotspots.details(rows.map((r) => r.id))')
  })

  it('الأنواع: الحقول الثقيلة اختيارية وpeak_hour متاح', () => {
    expect(sdk).toMatch(/vehicles\?: GpsHotspotVehicle\[\]/)
    expect(sdk).toMatch(/hours\?: number\[\]/)
    expect(sdk).toContain('peak_hour?: string')
  })
})
