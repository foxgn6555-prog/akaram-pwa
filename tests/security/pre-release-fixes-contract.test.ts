/** عقود إصلاحات ما قبل النشر — تمنعرجوع التي شُخّصت في الجولة الأخيرة. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pwaConfig } from '@config/pwa.config'

const read = (p: string) => readFileSync(p, 'utf8')

describe('عقود إصلاحات ما قبل النشر', () => {
  it('Supabase يقصّ أسطر النهاية من مفاتيح الواجهة، وCD يمرّر مفتاح VAPID العام ويفحص البيئة', () => {
    expect(read('src/config/supabase.config.ts')).toContain('raw?.trim()')
    for (const f of ['.github/workflows/cd-production.yml', '.github/workflows/cd-staging.yml']) {
      const src = read(f)
      expect(src).toContain('VITE_VAPID_PUBLIC_KEY: ${{ secrets.VITE_VAPID_PUBLIC_KEY }}')
      expect(src).toContain('npm run env:check')
    }
    expect(read('scripts/check-env.ts')).toContain('VITE_VAPID_PUBLIC_KEY')
    expect(read('src/features/notifications/push.client.ts')).not.toContain('VAPID_PRIVATE_KEY')
  })
  it('الإشعارات اللحظية منشورة، والجلسات الليلية تتقاطع مع مدى بغداد، وعارض الإثباتات قراءة فقط ومقيّد بالدور', () => {
    expect(read('supabase/migrations/20261115140000_notifications_realtime_publication.sql')).toContain('add table public.notifications')
    const live = read('supabase/migrations/20261115150000_live_sessions_overnight_overlap.sql')
    expect(live).toContain("at time zone 'Asia/Baghdad'")
    expect(live).toContain('s.started_at < v_to_exclusive')
    expect(live).toContain('coalesce(s.ended_at, s.shift_end, now()) >= v_from')
    const proofs = read('supabase/migrations/20261115160000_ops_contractor_presence_proofs.sql')
    expect(proofs).toContain("app.has_role(array['ops_room','super_admin'])")
    expect(proofs).toContain('security definer')
    expect(proofs).not.toMatch(/\b(insert into|update public\.|delete from)\b/i)
    expect(proofs).toContain('revoke all on function public.ops_contractor_presence_proofs')
  })
  it('جرس الهيدر غير مشروط بمعاينة IT، والإشعارات مشتركة على حساب المستخدم الحالي فقط', () => {
    const header = read('src/components/layout/Header/Header.tsx')
    expect(header).toContain('<NotificationBell />')
    expect(header).not.toContain('previewOnly')
    expect(read('src/services/notifications.sdk.ts')).toContain('filter: `user_id=eq.${userId}`')
  })
  it('PWA يسمح بكل الاتجاهات، وأزرار التنقل الداخلية مركّبة، ودليل التثبيت يميّز المتصفحات', () => {
    expect(pwaConfig.manifest).toMatchObject({ orientation: 'any' })
    expect(read('src/components/layout/AppShell.tsx')).toContain('<PwaNavControls />')
    const install = read('src/features/pwa/InstallAppButton.tsx')
    expect(install).toContain('detectBrowser')
    expect(install).toContain('in-app')
    expect(install).toContain('firefox')
    expect(read('index.html')).toContain('interactive-widget=resizes-content')
    expect(read('index.html')).toContain('user-scalable=no')
  })
  it('درج الموبايل فوق الهيدر ويقفل التمرير ويستعيد التركيز؛ صفحة الدخول قابلة للتمرير مع لوحة المفاتيح', () => {
    const sidebar = read('src/components/layout/Sidebar/Sidebar.tsx')
    expect(sidebar).toContain('z-[90]')
    expect(sidebar).toContain("document.body.style.overflow = 'hidden'")
    expect(sidebar).toContain('previous?.focus()')
    expect(sidebar).toContain("e.key === 'Escape'")
    const login = read('src/portals/public/pages/Login/LoginPage.tsx')
    expect(login).toContain('overflow-y-auto')
    expect(login).toContain('supports-[height:100dvh]:h-dvh')
    expect(login).toContain('login-glass-card')
    expect(read('src/styles/globals.css')).toContain('height: 100dvh;')
  })
  it('المشاركة المباشرة تصرّح بحدود المتصفح، وعلم اليوم/فلاتر البيانات بتوقيت بغداد', () => {
    expect(read('src/features/live-tracking/LiveShareCard.tsx')).toContain('لا يوجد تتبع مضمون بعد إغلاق التطبيق')
    const hook = read('src/features/live-tracking/useLiveShare.ts')
    expect(hook).toContain('readFlag(storage())')
    expect(hook).toContain("document.addEventListener('visibilitychange', resume)")
    const logic = read('src/features/live-tracking/live-data.logic.ts')
    expect(logic).toContain("timeZone: 'Asia/Baghdad'")
    expect(logic).toContain('Date.parse(`${isoDay(today)}T00:00:00Z`)')
  })
})
