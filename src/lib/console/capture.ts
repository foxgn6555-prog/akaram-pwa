/**
 * Console · راصد وقت التشغيل — يلتقط كل ما يظهر في وحدة تحكم المتصفح ويرسله
 * إلى التطوير المركزية على دفعات:
 *   · window.onerror (استثناءات غير معالجة) + أخطاء تحميل الملفات/الصور (capture)
 *   · unhandledrejection (وعود مرفوضة)
 *   · console.error / console.warn (التنبيهات التي تظهر في الكونسول)
 *   · logger.error / logger.warn (المسجّل الموحد — يشمل حاجز الشاشة ErrorBoundary)
 *   · أخطاء طبقة البيانات (SDKError عبر الناقل) بكودها الحقيقي (PGRST202، 42501 …)
 *
 * الضمانات: لا يكسر التطبيق أبداً، لا يرسل نفس الخطأ مرتين في الدفعة (بصمة + عدّاد)،
 * حد أقصى للجلسة، ولا يرسل أثناء انقطاع الشبكة (يحتفظ بالدفعة حتى العودة).
 * الإرسال مُحقن (send) حتى يُختبر الراصد كاملاً بلا شبكة.
 */
import { classify, type ConsoleLevel, type ConsoleSource, type RawEvent } from './classify'
import { onSdkError } from './bus'

export interface ConsoleEventPayload {
  message: string
  stack: string | null
  url: string
  user_agent: string
  level: ConsoleLevel
  source: ConsoleSource
  kind: string
  portal: string
  fingerprint: string
  count: number
  error_type: 'runtime' | 'network' | 'validation' | 'auth'
  context: Record<string, unknown>
}

export interface CaptureOptions {
  send: (events: ConsoleEventPayload[]) => Promise<unknown>
  /** مهلة تجميع الدفعة */
  flushMs?: number
  /** أقصى عدد بصمات مختلفة قبل إرسال فوري */
  maxBatch?: number
  /** أقصى أحداث ترسلها الجلسة كلها */
  maxPerSession?: number
  /** يُستدعى محلياً لكل حدث (للمعاينة الحية داخل نفس التبويب) */
  onLocal?: (e: ConsoleEventPayload) => void
}

export interface CaptureHandle {
  /** يرسل ما في الدفعة فوراً */
  flush: () => Promise<void>
  /** يزيل كل الخطافات ويعيد console كما كان */
  uninstall: () => void
  /** إدخال حدث يدوي (يستعمله logger) */
  push: (e: RawEvent & { context?: Record<string, unknown> }) => void
  /** عدد الأحداث المنتظرة */
  pending: () => number
}

const OWN_PREFIX = /^\[(error|warn|debug)\]/
const ERROR_TYPE_BY_KIND: Record<string, ConsoleEventPayload['error_type']> = {
  offline: 'network',
  server_5xx: 'network',
  timeout: 'network',
  realtime: 'network',
  auth_expired: 'auth',
  permission: 'auth',
  validation: 'validation',
  contract_code: 'validation',
}

let active: CaptureHandle | null = null

export function installConsoleCapture(opts: CaptureOptions): CaptureHandle {
  if (active) return active
  const flushMs = opts.flushMs ?? 4000
  const maxBatch = opts.maxBatch ?? 20
  const maxPerSession = opts.maxPerSession ?? 200

  const buffer = new Map<string, ConsoleEventPayload>()
  const reported = new WeakSet<object>()
  let sent = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let flushing: Promise<void> | null = null

  const schedule = () => {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, flushMs)
  }

  const flush = async () => {
    if (flushing) return flushing
    if (buffer.size === 0) return
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      schedule()
      return
    }
    const events = [...buffer.values()]
    buffer.clear()
    flushing = (async () => {
      try {
        await opts.send(events)
      } catch {
        /* صمت متعمد: فشل الإرسال لا يولّد خطأً جديداً */
      } finally {
        flushing = null
      }
    })()
    return flushing
  }

  const push: CaptureHandle['push'] = (raw) => {
    try {
      if (sent >= maxPerSession) return
      const message = (raw.message ?? '').toString().trim()
      if (!message) return
      const url = raw.url ?? (typeof location !== 'undefined' ? location.href : '')
      const c = classify({ ...raw, message, url })
      const existing = buffer.get(c.fingerprint)
      if (existing) {
        existing.count += 1
        if (opts.onLocal) opts.onLocal(existing)
        return
      }
      const payload: ConsoleEventPayload = {
        message: message.slice(0, 500),
        stack: raw.stack ? String(raw.stack).slice(0, 4000) : null,
        url: url.slice(0, 500),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
        level: c.level,
        source: raw.source ?? 'logger',
        kind: c.kind,
        portal: c.portal,
        fingerprint: c.fingerprint,
        count: 1,
        error_type: ERROR_TYPE_BY_KIND[c.kind] ?? 'runtime',
        context: {
          ...(raw.context ?? {}),
          ...(raw.code ? { code: raw.code } : {}),
          ...(raw.status ? { status: raw.status } : {}),
          ...(c.contractCode ? { contract_code: c.contractCode } : {}),
          title: c.info.title,
        },
      }
      buffer.set(c.fingerprint, payload)
      sent += 1
      if (opts.onLocal) opts.onLocal(payload)
      if (buffer.size >= maxBatch) void flush()
      else schedule()
    } catch {
      /* الراصد لا يرمي أبداً */
    }
  }

  const fromUnknown = (reason: unknown): RawEvent => {
    if (reason instanceof Error) {
      const anyErr = reason as Error & { code?: unknown; status?: unknown }
      return {
        message: reason.message || reason.name,
        stack: reason.stack ?? null,
        code: typeof anyErr.code === 'string' ? anyErr.code : null,
        status: typeof anyErr.status === 'number' ? anyErr.status : null,
      }
    }
    if (reason && typeof reason === 'object') {
      const o = reason as Record<string, unknown>
      return {
        message: String(o.message ?? o.error ?? JSON.stringify(reason).slice(0, 300)),
        code: typeof o.code === 'string' ? o.code : null,
        status: typeof o.status === 'number' ? o.status : null,
      }
    }
    return { message: String(reason) }
  }

  const alreadyReported = (reason: unknown) => {
    if (reason && typeof reason === 'object') {
      if (reported.has(reason)) return true
      reported.add(reason)
    }
    return false
  }

  // ── خطافات المتصفح ──
  const onWindowError = (ev: Event) => {
    const target = ev.target as (EventTarget & { tagName?: string; src?: string; href?: string }) | null
    if (target && target !== window && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
      const src = target.src || target.href || ''
      if (/^data:/.test(src)) return
      push({ message: `تعذر تحميل ${target.tagName === 'IMG' ? 'الصورة' : 'الملف'}: ${src.slice(0, 200)}`, source: 'asset', level: 'warn' })
      return
    }
    const e = ev as ErrorEvent
    if (e.error && alreadyReported(e.error)) return
    push({ ...fromUnknown(e.error ?? e.message), source: 'window', level: 'error' })
  }
  const onRejection = (ev: PromiseRejectionEvent) => {
    if (alreadyReported(ev.reason)) return
    push({ ...fromUnknown(ev.reason), source: 'promise', level: 'error' })
  }

  const origError = console.error
  const origWarn = console.warn
  const fmt = (args: unknown[]) =>
    args
      .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeJson(a)))
      .join(' ')
      .slice(0, 500)
  const consoleHook =
    (level: ConsoleLevel, orig: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      orig.apply(console, args)
      try {
        const first = args[0]
        if (typeof first === 'string' && OWN_PREFIX.test(first)) return // من logger — يصل عبر push مباشرة
        const errArg = args.find((a) => a instanceof Error) as Error | undefined
        if (errArg && alreadyReported(errArg)) return
        push({ message: fmt(args), stack: errArg?.stack ?? null, source: 'console', level })
      } catch {
        /* لا شيء */
      }
    }
  console.error = consoleHook('error', origError as (...a: unknown[]) => void)
  console.warn = consoleHook('warn', origWarn as (...a: unknown[]) => void)

  const offSdk = onSdkError((n) => {
    if (alreadyReported(n.error)) return
    const codeIsContract = /^[A-Z][A-Z0-9_]+$/.test(n.code) && !/^PGRST/.test(n.code) && !['UNKNOWN', 'NETWORK', 'EMPTY_RESULT'].includes(n.code)
    push({ message: codeIsContract ? `${n.code}: ${n.message}` : n.message, code: n.code, source: 'sdk', level: 'error' })
  })

  const onHide = () => {
    if (document.visibilityState === 'hidden') void flush()
  }
  window.addEventListener('error', onWindowError, true)
  window.addEventListener('unhandledrejection', onRejection)
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', () => void flush())

  active = {
    flush,
    push,
    pending: () => buffer.size,
    uninstall: () => {
      window.removeEventListener('error', onWindowError, true)
      window.removeEventListener('unhandledrejection', onRejection)
      document.removeEventListener('visibilitychange', onHide)
      offSdk()
      console.error = origError
      console.warn = origWarn
      if (timer) clearTimeout(timer)
      timer = null
      buffer.clear()
      active = null
    },
  }
  return active
}

export function getConsoleCapture(): CaptureHandle | null {
  return active
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}
