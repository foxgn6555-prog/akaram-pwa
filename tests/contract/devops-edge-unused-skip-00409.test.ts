/**
 * 00409 — صفحة حالة التطوير لا تطلب الدوال غير المنشورة
 * عيب مكتشَف بالفحص الحيّ (④-58): gps-receiver وwebhooks غير منشورتين، وكان الفحص
 * يطلبهما ⇒ 404 + خطأ CORS أحمر في console بلا فائدة. والدليل كان يوصي بنشر الاسم القديم.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sdk = readFileSync(join(process.cwd(), 'src/services/devops.sdk.ts'), 'utf8')
const dbGuide = readFileSync(join(process.cwd(), 'src/features/devops-guide/content/database.ts'), 'utf8')
const hostGuide = readFileSync(join(process.cwd(), 'src/features/devops-guide/content/hosting.ts'), 'utf8')

describe('00409 — لا فحص شبكي لدوال غير منشورة', () => {
  it('الدوال الموسومة unused تُعاد بـunknown بلا أي طلب', () => {
    expect(sdk).toMatch(/if \(f\.unused\) return \{[^}]*state: 'unknown'[^}]*\}/)
    // الشرط قبل بناء الرابط ونداء الفحص
    expect(sdk.indexOf("if (f.unused) return")).toBeLessThan(sdk.indexOf('const url = `${base}/functions/v1/${f.name}`'))
  })

  it('gps-receiver وwebhooks ما زالتا موثّقتين كغير منشورتين', () => {
    expect(sdk).toMatch(/gps-receiver[^\n]*unused: true/)
    expect(sdk).toMatch(/webhooks[^\n]*unused: true/)
    expect(sdk).toMatch(/غير منشورة/)
  })

  it('دليل التشغيل لم يعد يوصي بنشر gps-receiver', () => {
    expect(dbGuide).not.toMatch(/gps-receiver/)
    expect(hostGuide).not.toMatch(/gps-receiver/)
    expect(hostGuide).toMatch(/lvn-gps-sync/)
    expect(hostGuide).toMatch(/deploy lvn-gps-sync gps-warehouse/)
  })
})
