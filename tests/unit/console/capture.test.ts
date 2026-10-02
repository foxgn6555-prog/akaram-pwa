/**
 * Console · الراصد: يلتقط console.error/warn، الاستثناءات، الوعود المرفوضة، أخطاء الملفات،
 * logger، وطبقة البيانات — يجمع بالبصمة ويرسل دفعة واحدة. بلا شبكة (send محقونة).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installConsoleCapture, getConsoleCapture, type ConsoleEventPayload } from '@lib/console/capture'
import { emitSdkError } from '@lib/console/bus'

vi.mock('@lib/monitoring/sentry', () => ({
  Sentry: { withScope: vi.fn(), captureMessage: vi.fn(), captureException: vi.fn() },
  initMonitoring: vi.fn(),
}))

const flushAll = async (h: ReturnType<typeof installConsoleCapture>) => {
  await h.flush()
}

describe('Console · capture', () => {
  let sent: ConsoleEventPayload[][]
  let send: ReturnType<typeof vi.fn>
  const origError = console.error
  const origWarn = console.warn

  beforeEach(() => {
    sent = []
    send = vi.fn(async (ev: ConsoleEventPayload[]) => {
      sent.push(ev)
    })
    getConsoleCapture()?.uninstall()
  })
  afterEach(() => {
    getConsoleCapture()?.uninstall()
    console.error = origError
    console.warn = origWarn
  })

  it('console.error و console.warn يصلان كحدثين بمستويين مختلفين — والأصل ما زال يُطبع', async () => {
    const spyErr = vi.fn()
    const spyWarn = vi.fn()
    console.error = spyErr
    console.warn = spyWarn
    const h = installConsoleCapture({ send, flushMs: 100000 })
    console.error('Something failed', { a: 1 })
    console.warn('Warning: Each child in a list should have a unique "key" prop.')
    expect(spyErr).toHaveBeenCalledTimes(1)
    expect(spyWarn).toHaveBeenCalledTimes(1)
    expect(h.pending()).toBe(2)
    await flushAll(h)
    expect(send).toHaveBeenCalledTimes(1)
    const batch = sent[0]!
    expect(batch.map((e) => e.level).sort()).toEqual(['error', 'warn'])
    const warn = batch.find((e) => e.level === 'warn')!
    expect(warn.kind).toBe('react_warning')
    expect(warn.source).toBe('console')
    expect(h.pending()).toBe(0)
  })

  it('نفس الخطأ مرتين = حدث واحد بعداد 2 (تجميع بالبصمة)', async () => {
    console.error = vi.fn()
    const h = installConsoleCapture({ send, flushMs: 100000 })
    console.error("Cannot read properties of undefined (reading 'id') at row 3")
    console.error("Cannot read properties of undefined (reading 'id') at row 9")
    await flushAll(h)
    expect(sent[0]).toHaveLength(1)
    expect(sent[0]![0]!.count).toBe(2)
    expect(sent[0]![0]!.kind).toBe('null_access')
  })

  it('استثناء عام (window error) + وعد مرفوض يُلتقطان — ولا يُعدّ الكائن نفسه مرتين', async () => {
    console.error = vi.fn()
    const h = installConsoleCapture({ send, flushMs: 100000 })
    const err = new TypeError('x is not a function')
    window.dispatchEvent(new ErrorEvent('error', { error: err, message: err.message }))
    // نفس الكائن يصل ثانية عبر console.error (كما يفعل React) — يجب تجاهله
    console.error(err)
    const rej = Object.assign(new Error('Failed to fetch'), {})
    const pre = new Event('unhandledrejection') as Event & { reason?: unknown }
    pre.reason = rej
    window.dispatchEvent(pre)
    await flushAll(h)
    const batch = sent[0]!
    expect(batch).toHaveLength(2)
    expect(batch.find((e) => e.source === 'window')!.kind).toBe('null_access')
    expect(batch.find((e) => e.source === 'promise')!.kind).toBe('offline')
  })

  it('فشل تحميل صورة يُلتقط كـ asset_missing (مرحلة الالتقاط)', async () => {
    const h = installConsoleCapture({ send, flushMs: 100000 })
    const img = document.createElement('img')
    img.src = 'https://cdn.example/missing.png'
    document.body.appendChild(img)
    img.dispatchEvent(new Event('error', { bubbles: false }))
    await flushAll(h)
    expect(sent[0]![0]!.kind).toBe('asset_missing')
    expect(sent[0]![0]!.level).toBe('warn')
    expect(sent[0]![0]!.message).toContain('missing.png')
  })

  it('خطأ طبقة البيانات يصل بكوده الحقيقي عبر الناقل (PGRST202 → rpc_missing)', async () => {
    const h = installConsoleCapture({ send, flushMs: 100000 })
    const e = new Error('Could not find the function public.media_period_summary')
    emitSdkError({ message: e.message, code: 'PGRST202', error: e })
    await flushAll(h)
    expect(sent[0]![0]!.kind).toBe('rpc_missing')
    expect(sent[0]![0]!.source).toBe('sdk')
    expect(sent[0]![0]!.context.code).toBe('PGRST202')
  })

  it('logger.error يصل مرة واحدة فقط (لا ازدواج مع console.error الذي يطبعه)', async () => {
    console.error = vi.fn()
    const h = installConsoleCapture({ send, flushMs: 100000 })
    const { logger } = await import('@lib/monitoring/logger')
    logger.error(new Error('render exploded'), { componentStack: 'in MediaDesigns' })
    logger.warn('RLS rejection', { code: '42501' })
    await flushAll(h)
    const batch = sent[0]!
    expect(batch).toHaveLength(2)
    const boundary = batch.find((e) => e.source === 'boundary')!
    expect(boundary.kind).toBe('react_render')
    const rls = batch.find((e) => e.level === 'warn')!
    expect(rls.kind).toBe('permission')
  })

  it('البوابة تُستنتج من الرابط الحالي — خطأ في /media يُنسب لبوابة الإعلام', async () => {
    window.history.pushState({}, '', '/media/designs/4')
    const h = installConsoleCapture({ send, flushMs: 100000 })
    h.push({ message: 'MEDIA_DESIGN_LOCKED: مقفل', source: 'sdk' })
    await flushAll(h)
    expect(sent[0]![0]!.portal).toBe('media')
    expect(sent[0]![0]!.context.contract_code).toBe('MEDIA_DESIGN_LOCKED')
    expect(sent[0]![0]!.error_type).toBe('validation')
    window.history.pushState({}, '', '/')
  })

  it('الإرسال التلقائي: بعد المهلة أو عند بلوغ حجم الدفعة', async () => {
    vi.useFakeTimers()
    try {
      const h = installConsoleCapture({ send, flushMs: 3000, maxBatch: 3 })
      h.push({ message: 'a1' })
      expect(send).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(3000)
      expect(send).toHaveBeenCalledTimes(1)
      h.push({ message: 'bx' })
      h.push({ message: 'by' })
      h.push({ message: 'bz' })
      await vi.advanceTimersByTimeAsync(0)
      expect(send).toHaveBeenCalledTimes(2)
      expect(sent[1]).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('حد الجلسة يمنع الإغراق، وفشل الإرسال لا يرمي', async () => {
    const bad = vi.fn(async () => {
      throw new Error('network down')
    })
    const h = installConsoleCapture({ send: bad, flushMs: 100000, maxPerSession: 2 })
    h.push({ message: 'one' })
    h.push({ message: 'two' })
    h.push({ message: 'three' })
    expect(h.pending()).toBe(2)
    await expect(h.flush()).resolves.toBeUndefined()
    expect(bad).toHaveBeenCalledTimes(1)
  })

  it('uninstall يعيد console كما كان ويمنع الالتقاط', async () => {
    const mine = vi.fn()
    console.error = mine
    const h = installConsoleCapture({ send, flushMs: 100000 })
    expect(console.error).not.toBe(mine)
    h.uninstall()
    expect(console.error).toBe(mine)
    expect(getConsoleCapture()).toBeNull()
  })
})
