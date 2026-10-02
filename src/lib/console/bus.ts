/**
 * Console · ناقل خفيف بلا اعتماديات — طبقة البيانات (client.ts) تنشر أخطاءها هنا
 * ويستهلكها الراصد (capture.ts). مفصول حتى لا تنشأ دورة استيراد بين services و lib.
 */
export interface SdkErrorNotice {
  message: string
  code: string
  /** الكائن الأصلي — لمنع العدّ المزدوج عندما يصل نفسه لاحقاً عبر logger */
  error: object
}

type Listener = (n: SdkErrorNotice) => void
const listeners = new Set<Listener>()

export function onSdkError(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function emitSdkError(n: SdkErrorNotice): void {
  for (const l of listeners) {
    try {
      l(n)
    } catch {
      /* الراصد لا يكسر طبقة البيانات أبداً */
    }
  }
}
