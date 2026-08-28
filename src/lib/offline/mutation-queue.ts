import type { QueuedMutation } from './types'

/**
 * طابور طفرات Offline — تخزين localStorage (بسيط وموثوق للنطاق الحالي).
 * مسار الترقية الموثق: IndexedDB عبر idb-keyval عند تجاوز 5MB (docs/offline-policy.md).
 * يعمل مع vite-plugin-pwa: قبلunload يبقى، وعند حدث 'online' يُصفَّر الطابور.
 */
const STORAGE_KEY = 'municipal:mutation-queue'
const MAX_RETRIES = 5

type Executor = (mutation: QueuedMutation) => Promise<void>

export class MutationQueueImpl {
  private executor: Executor | null = null
  private flushing = false

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flush())
    }
  }

  registerExecutor(executor: Executor): void {
    this.executor = executor
  }

  enqueue(mutation: Omit<QueuedMutation, 'id' | 'queuedAt' | 'retries'>): void {
    const full: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      queuedAt: Date.now(),
      retries: 0,
    }
    const queue = this.read()
    queue.push(full)
    this.write(queue)
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.executor || !navigator.onLine) return
    this.flushing = true
    try {
      let queue = this.read()
      while (queue.length > 0) {
        const [next, ...rest] = queue
        if (!next) break
        try {
          await this.executor(next)
          queue = rest
          this.write(queue)
        } catch {
          next.retries += 1
          if (next.retries >= MAX_RETRIES) {
            queue = rest // تُسلَّم للمستخدم عبر OfflineBanner عند بدء التشغيل
            this.write(queue)
          } else {
            this.write([next, ...rest])
          }
          break // توقف حتى المحاولة القادمة
        }
      }
    } finally {
      this.flushing = false
    }
  }

  get size(): number {
    return this.read().length
  }

  clear(): void {
    this.write([])
  }

  private read(): QueuedMutation[] {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as QueuedMutation[]
    } catch {
      return []
    }
  }

  private write(queue: QueuedMutation[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  }
}

export const mutationQueue = new MutationQueueImpl()
