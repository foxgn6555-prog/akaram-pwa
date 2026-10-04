/** فحص نقطة نهاية ADMS من المتصفح (00173) — منطق خالص قابل للاختبار */
import type { DiagStatus } from '@features/integrations'

export type ProbeResult = { status: DiagStatus; detail: string; ms?: number }

const EXPECTED = 'GET OPTION FROM: PLATFORM-TEST'

/** يحوّل ما أدخله المستخدم (مضيف فقط / رابط كامل) إلى أصل URL قابل للاختبار */
export function normalizeProbeBase(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`
  try {
    const u = new URL(withScheme)
    return (u.origin + u.pathname).replace(/\/+$/, '')
  } catch { return null }
}

/** يفحص نقطة نهاية ADMS: يجب أن ترد «GET OPTION FROM: PLATFORM-TEST» */
export async function probeAdmsEndpoint(base: string, fetchImpl: typeof fetch = fetch): Promise<ProbeResult> {
  const started = Date.now()
  const url = `${base}/iclock/cdata?SN=PLATFORM-TEST&options=all&probe=${started}`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetchImpl(url, { method: 'GET', signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    const ms = Date.now() - started
    const text = (await res.text()).trim()
    if (res.ok && text.startsWith(EXPECTED)) return { status: 'ok', detail: `يرد رد ADMS الصحيح (${ms} م.ث)`, ms }
    if (res.ok && text === 'OK') return { status: 'fail', detail: 'الخادم يرد «OK» عاماً — مسار /iclock لا يصل إلى المستقبل (نسخة قديمة من الدالة أو وسيط لا يمرّر المسار)', ms }
    return { status: 'fail', detail: `رد غير متوقع (HTTP ${res.status}): ${text.slice(0, 80) || '—'}`, ms }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/abort/i.test(msg)) return { status: 'fail', detail: 'انتهت المهلة (10 ثوانٍ) — العنوان لا يستجيب' }
    // سياسة CSP في index.html تسمح بـ *.deno.net / *.deno.dev / *.workers.dev فقط — نطاق آخر يُحجب من المتصفح لا من الشبكة
    let host = ''
    try { host = new URL(base).hostname } catch { /* تجاهل */ }
    const allowed = /(\.deno\.net|\.deno\.dev|\.workers\.dev|\.supabase\.co)$/i.test(host)
    if (!allowed) return { status: 'warn', detail: `المتصفح يمنع الاتصال بـ ${host} بسبب سياسة أمان المحتوى (CSP) في المنصة — هذا لا يؤثر على الجهاز. لتفعيل الاختبار أضف النطاق إلى connect-src في index.html` }
    return { status: 'fail', detail: 'تعذّر الوصول من المتصفح (DNS/الشهادة/CORS/إضافة حجب) — افتح الرابط في تبويب جديد: إن ظهر «GET OPTION FROM» فالشبكة سليمة وتجاهل هذا البند' }
  }
}
