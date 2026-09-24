/** أدوات تهيئة مصادر البصمة (بلا مكوّنات — لسلامة Fast Refresh) */
import type { BiometricDevice, BiometricDeviceConfig, BiometricMode } from '@features/integrations'

export const MODE_HINTS: Record<BiometricMode, string> = {
  adms_push: 'الجهاز يتصل بنا بنفسه عبر رابط ADMS — لا يلزم رابط أو مفتاح هنا؛ يكفي الرقم التسلسلي.',
  app_api_pull: 'نسحب من API التطبيق المشترك: رابط الأساس + مفتاح API. العقد الافتراضي GET {base_url}/attendance/logs?from&to ويُعيد records[].',
  lan_pull: 'نسحب مباشرة من الجهاز/الخدمة على الشبكة الداخلية (ZKTeco JSON أو ATTLOG خام). يلزم أن يكون الخادم قادراً على الوصول للعنوان الداخلي (VPN/نفق).',
  generic_pull: 'أي مصدر JSON آخر: عرّف مسار مصفوفة السجلات وخريطة الحقول (PIN، الوقت، الاتجاه…).',
  zk_bridge: 'وكيل صغير (tools/zk-bridge) يعمل على حاسوب داخل شبكة الجهة، يسحب كل سجلات الجهاز عبر المنفذ 4370 ويرسلها إلينا بمفتاح الجهاز. لا يحتاج الجهاز إلى إنترنت ولا يحتاج الخادم إلى VPN، ويعوّض ما فاته ADMS.',
}

/** تنظيف التهيئة قبل الحفظ: إزالة الحقول الفارغة كي لا تُخزَّن سلاسل فارغة */
export function cleanConfig(mode: BiometricMode, c: BiometricDeviceConfig): BiometricDeviceConfig {
  if (mode === 'adms_push' || mode === 'zk_bridge') return {}
  const out: BiometricDeviceConfig = {}
  const str = (k: keyof BiometricDeviceConfig) => {
    const v = c[k]
    if (typeof v === 'string' && v.trim()) (out as Record<string, unknown>)[k] = v.trim()
  }
  ;(['base_url', 'path', 'api_key', 'api_key_header', 'auth_bearer', 'basic_user', 'basic_pass', 'from_param', 'to_param', 'timezone_offset', 'records_path'] as const).forEach(str)
  if (c.in_values?.length) out.in_values = c.in_values
  if (c.out_values?.length) out.out_values = c.out_values
  if (mode === 'generic_pull' && c.mapping) {
    const m = Object.fromEntries(Object.entries(c.mapping).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim()]))
    out.mapping = { pin: '', ...m } as NonNullable<BiometricDeviceConfig['mapping']>
  }
  return out
}

/** تحقق محلي قبل الإرسال — نفس رموز الخادم كي تتوحد الرسائل */
export function validateConfigLocally(mode: BiometricMode, c: BiometricDeviceConfig): string | null {
  if (mode === 'adms_push' || mode === 'zk_bridge') return null
  const base = (c.base_url ?? '').trim()
  if (!/^https?:\/\/\S+$/i.test(base)) return 'BIO_CONFIG_BASE_URL'
  if (mode === 'generic_pull') {
    const m = c.mapping
    if (!m?.pin?.trim() || (!m.at?.trim() && !(m.date?.trim() && m.time?.trim()))) return 'BIO_CONFIG_MAPPING'
  }
  return null
}

/** 00141 · مقتطف config.json لوكيل الجسر (tools/zk-bridge) */
export function bridgeConfigSnippet(d: Pick<BiometricDevice, 'serial_number'>, key: string | null, supabaseUrl: string) {
  return JSON.stringify({
    supabase_url: supabaseUrl,
    interval_minutes: 5,
    devices: [{ serial: d.serial_number, ip: '192.168.1.201', port: 4370, comm_key: 0, bridge_key: key ?? 'zkb_…(ولّد المفتاح أعلاه)', send_users: true }],
  }, null, 2)
}
