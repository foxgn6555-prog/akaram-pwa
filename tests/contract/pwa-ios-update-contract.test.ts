/**
 * الجولة ٣-هـ — عقد تحديث PWA على iPhone:
 *  · القشرة تُخدم NetworkFirst (لا index.html مخزَّن يُشير إلى أصول محذوفة)
 *  · «حدّث الآن» ينتهي دائمًا بشيء ملموس (applyPwaUpdate + safeReload)
 *  · بصمة إصدار version.json تُبنى وتُفحص عبر الشبكة
 *  · حارس إقلاع يمنع الشاشة الأبدية، ويُحمَّل كملف مستقل (احترام CSP)
 *  · الاستضافة لا تكاش version.json ولا حارس الإقلاع
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pwaConfig } from '@config/pwa.config'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('📱 تحديث PWA على iOS (الجولة ٣-هـ)', () => {
  const sw = read('src/workers/sw.ts')

  it('القشرة NetworkFirst مع مهلة واحتياط ثلاثي (كاش الشبكة → precache → offline)', () => {
    expect(sw).toContain('app-shell-r1')
    expect(sw).toContain('NAV_TIMEOUT_MS')
    expect(sw).toContain('AbortController')
    expect(sw).toContain("createHandlerBoundToURL('index.html')")
    expect(sw).toContain("createHandlerBoundToURL('offline.html')")
    // ترتيب الاحتياط: كاش القشرة يُقرأ قبل precache
    const shellIdx = sw.indexOf('SHELL_CACHE)).match(SHELL_KEY)')
    const precacheIdx = sw.indexOf('appShellHandler(params as never)')
    expect(shellIdx).toBeGreaterThan(0)
    expect(precacheIdx).toBeGreaterThan(shellIdx)
  })

  it('زر التحديث يمرّ عبر applyPwaUpdate المضمون (لا SKIP_WAITING يتيماً)', () => {
    const main = read('src/main.tsx')
    expect(main).toContain('applyPwaUpdate')
    expect(main).toContain('applyUpdateForStore')
    expect(main).toContain('safeReload()')
    // المسار الصامت (تطبيق تلقائي عند الخمول) يستخدم نفس المنطق
    expect(main).toMatch(/canApplyWhileHidden[\s\S]{0,400}applyPwaUpdate\(\)/)
    const apply = read('src/features/pwa/apply-update.ts')
    expect(apply).toContain("'SKIP_WAITING'")
    expect(apply).toContain('hardResetApp')
    expect(apply).toContain('UPDATE_ACTIVATION_WAIT_MS')
  })

  it('بصمة الإصدار تُبنى كـ version.json وتُفحص من الشبكة بلا كاش', () => {
    const vite = read('vite.config.ts')
    expect(vite).toContain('version.json')
    expect(vite).toContain("name: 'emit-version-json'")
    const watch = read('src/features/pwa/version-watch.ts')
    expect(watch).toContain("cache: 'no-store'")
    expect(watch).toContain('VERSION_PROBE_PATH')
    // لا تدخل precache
    expect(pwaConfig.injectManifest?.globIgnores ?? []).toEqual(
      expect.arrayContaining(['version.json', 'boot-watchdog.js']),
    )
  })

  it('حارس الإقلاع: ملف مستقل محمّل من index.html (CSP بلا inline) وبطاقة استرداد', () => {
    expect(existsSync(join(root, 'public/boot-watchdog.js'))).toBe(true)
    const html = read('index.html')
    expect(html).toContain('<script src="/boot-watchdog.js"></script>')
    // لا inline: سياسة CSP في index.html تسمح ببصمة واحدة فقط للـinline
    expect(html).not.toMatch(/akaram-boot-recovery[\s\S]*?<\/script>/)
    const watchdog = read('public/boot-watchdog.js')
    expect(watchdog).toContain('__akaramBooted')
    expect(watchdog).toContain('akaramHardReset')
    expect(watchdog).toContain('RECOVERY_KEY')
    // الإشارة تُرفع بعد التركيب الفعلي في App.tsx لا في نقطة الدخول
    expect(read('src/App.tsx')).toContain('window.__akaramBooted = true')
  })

  it('الاستضافة تمنع كاش version.json وboot-watchdog.js', () => {
    const apache = read('public/.htaccess')
    expect(apache).toMatch(/Files "version\.json"[\s\S]*?no-cache, no-store, must-revalidate/)
    expect(apache).toMatch(/Files "boot-watchdog\.js"[\s\S]*?no-cache, must-revalidate/)
  })

  it('شريط التحديث يعرض مخرجاً يدوياً («لم يعمل؟»)', () => {
    const banner = read('src/features/pwa/PwaBanners.tsx')
    expect(banner).toContain('pwa-update-repair')
    expect(banner).toContain('hardResetApp')
  })
})
