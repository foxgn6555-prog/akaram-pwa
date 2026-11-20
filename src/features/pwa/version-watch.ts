/**
 * فحص إصدار التطبيق عبر الشبكة (الجولة ٣-هـ) — مستقل تماماً عن عامل الخدمة.
 *
 * لماذا نحتاجه: على iPhone لا يُعيد المتصفح فحص الـSW عند العودة للتطبيق، وقد يبقى
 * العامل القديم أياماً. لذلك نُنزّل ملفاً صغيراً `version.json` (يُبنى مع كل نشر)
 * ونقارن بصمته ببصمة البناء العامل. الفرق ⇒ «يتوفر تحديث» فوراً بلا انتظار الـSW.
 *
 * بلا أثر شبكي يُذكر: ملف بحجم عشرات البايتات، يُفحص عند العودة للتطبيق وكل ١٥ دقيقة.
 */
export const VERSION_PROBE_PATH = '/version.json'
export const VERSION_CHECK_INTERVAL_MS = 15 * 60 * 1000

export interface VersionProbeOptions {
  fetchImpl?: typeof fetch
  currentVersion: string
  path?: string
}

/** true = النسخة المنشورة أحدث من العاملة (أو مختلفة) */
export async function isUpdatePublished(options: VersionProbeOptions): Promise<boolean> {
  const fetcher = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : null)
  if (!fetcher) return false
  try {
    const res = await fetcher(options.path ?? VERSION_PROBE_PATH, { cache: 'no-store' })
    if (!res.ok) return false
    const data = (await res.json()) as { version?: unknown }
    if (typeof data?.version !== 'string' || !data.version) return false
    return data.version !== options.currentVersion
  } catch {
    // شبكة/JSON سيئ/حجب: لا حكم ولا إزعاج للمستخدم
    return false
  }
}

export interface VersionWatchOptions extends VersionProbeOptions {
  onOutdated: () => void
  intervalMs?: number
  win?: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setInterval' | 'clearInterval'>
  doc?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'>
}

/** يفحص عند الإقلاع، وعند عودة التطبيق للمقدمة، وكل ١٥ دقيقة ما دام مرئياً */
export function watchPublishedVersion(options: VersionWatchOptions): () => void {
  const win = options.win ?? window
  const doc = options.doc ?? document
  const intervalMs = options.intervalMs ?? VERSION_CHECK_INTERVAL_MS
  let stopped = false
  let checking = false

  const check = async (): Promise<void> => {
    if (stopped || checking) return
    if (doc.visibilityState !== 'visible') return
    checking = true
    try {
      if (await isUpdatePublished(options)) {
        if (!stopped) options.onOutdated()
      }
    } finally {
      checking = false
    }
  }

  const onVisible = (): void => { if (doc.visibilityState === 'visible') void check() }
  doc.addEventListener('visibilitychange', onVisible)
  win.addEventListener('focus', onVisible)
  win.addEventListener('online', onVisible)
  const timer = win.setInterval(() => { void check() }, intervalMs)
  void check()

  return () => {
    stopped = true
    doc.removeEventListener('visibilitychange', onVisible)
    win.removeEventListener('focus', onVisible)
    win.removeEventListener('online', onVisible)
    win.clearInterval(timer)
  }
}
