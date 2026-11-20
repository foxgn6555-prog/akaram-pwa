/**
 * الجولة ٣-هـ — «حدّث الآن» المضمون.
 * العطل المرصود: الزر يرسل SKIP_WAITING لمنتظر غير موجود (أو لا يستجيب على iPhone)
 * فيدور بلا نهاية. المطلوب: كل مسار ينتهي ببناء طازج — بلا نقرة ميتة.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UPDATE_ACTIVATION_WAIT_MS,
  __resetReloadGuard,
  applyPwaUpdate,
  safeReload,
} from '@features/pwa/apply-update'

/** عامل خدمة مزيّف يسجّل الرسائل ويسمح بإطلاق controllerchange يدوياً */
function fakeWorker() {
  const messages: unknown[] = []
  return {
    messages,
    postMessage: (msg: unknown) => { messages.push(msg) },
  }
}

function fakeRegistration(waiting: ReturnType<typeof fakeWorker> | null, onUpdate?: () => void) {
  return {
    waiting: waiting as unknown as ServiceWorker | null,
    update: vi.fn(async () => { onUpdate?.() }),
  }
}

let listeners: Array<() => void> = []
const addControllerListener = (fn: () => void, remove: boolean): void => {
  if (remove) listeners = listeners.filter((l) => l !== fn)
  else listeners.push(fn)
}
const fireControllerChange = (): void => { for (const l of [...listeners]) l() }

beforeEach(() => { listeners = []; __resetReloadGuard(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); __resetReloadGuard() })

describe('applyPwaUpdate — المسارات الثلاثة', () => {
  it('عامل منتظر يستجيب: SKIP_WAITING ثم إعادة تحميل واحدة', async () => {
    const worker = fakeWorker()
    const reload = vi.fn()
    const promise = applyPwaUpdate({
      getRegistration: async () => fakeRegistration(worker),
      reload,
      addControllerListener,
      waitMs: 50,
    })
    // نُفعّل العامل المنتظر كما يفعل المتصفح
    await vi.advanceTimersByTimeAsync(0)
    fireControllerChange()
    const outcome = await promise

    expect(worker.messages).toContainEqual({ type: 'SKIP_WAITING' })
    expect(worker.messages).toContain('SKIP_WAITING')
    expect(outcome).toBe('activated')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('عامل منتظر لا يستجيب (حالة iPhone): إعادة تهيئة كاملة بدل الدوران', async () => {
    const worker = fakeWorker()
    const reload = vi.fn()
    const hardReset = vi.fn(async () => undefined)
    const promise = applyPwaUpdate({
      getRegistration: async () => fakeRegistration(worker),
      reload,
      hardReset,
      addControllerListener,
      waitMs: 30,
    })
    await vi.advanceTimersByTimeAsync(40)
    const outcome = await promise

    expect(outcome).toBe('reset')
    expect(hardReset).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it('لا عامل منتظر بعد الفحص: تحميل طازج مباشرة (لا نقرة ميتة)', async () => {
    const reload = vi.fn()
    const outcome = await applyPwaUpdate({
      getRegistration: async () => fakeRegistration(null),
      reload,
      addControllerListener,
      waitMs: 20,
    })
    expect(outcome).toBe('no-worker')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('الفحص يكشف عاملاً منتظراً جديداً بعد update()', async () => {
    const worker = fakeWorker()
    const reload = vi.fn()
    const registration: { waiting: ServiceWorker | null; update: () => Promise<void> } = {
      waiting: null,
      update: async () => { registration.waiting = worker as unknown as ServiceWorker },
    }
    const promise = applyPwaUpdate({
      getRegistration: async () => registration,
      reload,
      hardReset: vi.fn(async () => undefined),
      addControllerListener,
      waitMs: 40,
    })
    await vi.advanceTimersByTimeAsync(50)
    const outcome = await promise
    expect(worker.messages.length).toBeGreaterThan(0) // أُرسلت SKIP_WAITING فعلاً
    expect(outcome).toBe('reset') // لم يصل controllerchange ⇒ إعادة تهيئة (لا تعليق)
  })

  it('لا تسجيل إطلاقاً (متصفح بلا SW): تحميل طازج', async () => {
    const reload = vi.fn()
    const outcome = await applyPwaUpdate({
      getRegistration: async () => undefined,
      reload,
      addControllerListener,
      waitMs: 10,
    })
    expect(outcome).toBe('no-worker')
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('safeReload — حارس إعادة تحميل واحدة', () => {
  it('نداءات متعددة تُنتج إعادة تحميل واحدة', () => {
    const reload = vi.fn()
    safeReload(reload)
    safeReload(reload)
    safeReload(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('المهلة الافتراضية قصيرة بما يكفي: أقل من ٣ ثوانٍ', () => {
    expect(UPDATE_ACTIVATION_WAIT_MS).toBeLessThan(3000)
  })
})
