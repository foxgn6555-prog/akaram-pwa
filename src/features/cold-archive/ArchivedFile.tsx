/**
 * 🧊 بطاقة «مؤرشفة خارجياً» (00318) — تظهر مكان أي صورة حُذفت من المنصة بعد نسخها إلى قرص.
 *  تُستخدم في كل البوابات: الصورة الموجودة تُعرض كالمعتاد؛ المفقودة تُستعلم من `cold_archive_lookup`؛
 *  إن كانت مؤرشفة تظهر البطاقة (رمز الحزمة، الأقراص، تاريخ الحذف)، وإلا يظهر البديل المعتاد.
 */
import { useEffect, useMemo, useState } from 'react'
import { Archive } from 'lucide-react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { coldArchiveLookup, type ArchivedFileInfo } from '@sdk/cold-archive.sdk'
import { formatDate } from '@lib/utils/date.utils'

/* ذاكرة مؤقتة على مستوى الوحدة (لا تعتمد على React Query حتى تعمل في أي شجرة مكوّنات): النتيجة ثابتة لأن الحذف لا يُلغى */
const cache = new Map<string, ArchivedFileInfo | null>()
const inflight = new Map<string, Promise<void>>()
const key = (bucket: string, path: string) => `${bucket}\n${path}`
async function fetchMissing(bucket: string, paths: string[]): Promise<void> {
  const todo = paths.filter((p) => !cache.has(key(bucket, p)))
  if (todo.length === 0) return
  const k = `${bucket}|${todo.join('|')}`
  if (!inflight.has(k)) {
    inflight.set(k, coldArchiveLookup(bucket, todo)
      .then((res) => { for (const p of todo) cache.set(key(bucket, p), res[p] ?? null) })
      .catch(() => { /* نتركها بلا تخزين — تُعاد المحاولة في عرض لاحق */ })
      .finally(() => inflight.delete(k)))
  }
  await inflight.get(k)
}
/** للاختبارات فقط */
export const __resetArchivedLookupCache = () => { cache.clear(); inflight.clear() }

/** يستعلم عن المسارات المفقودة فقط ويعيد خريطة {path → معلومات الأرشفة} لما هو مؤرشف */
export function useArchivedLookup(bucket: string, paths: string[], enabled = true): { data: Record<string, ArchivedFileInfo> } {
  const joined = paths.join('|')
  const [, bump] = useState(0)
  useEffect(() => {
    if (!enabled || paths.length === 0) return
    let alive = true
    void fetchMissing(bucket, paths).then(() => { if (alive) bump((n) => n + 1) })
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- المصفوفة تُقارن بمحتواها (joined)
  }, [bucket, joined, enabled])
  const data = useMemo(() => {
    const out: Record<string, ArchivedFileInfo> = {}
    for (const p of paths) { const v = cache.get(key(bucket, p)); if (v) out[p] = v }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps -- تُعاد الحسبة عند تغيّر المحتوى أو بعد وصول نتيجة (bump)
  }, [bucket, joined, cache.size])
  return { data }
}

export function ArchivedFileCard({ info, className, compact = false }: { info: ArchivedFileInfo; className?: string; compact?: boolean }) {
  return (
    <div dir="rtl" data-testid="archived-file-card" title={`مؤرشفة خارجياً — الحزمة ${info.package_code}`}
      className={clsx('flex size-full flex-col items-center justify-center gap-1 overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200 p-2 text-center text-slate-700', className)}>
      <Archive size={compact ? 16 : 22} className="shrink-0 text-slate-500" aria-hidden="true" />
      <span className={clsx('font-black leading-tight', compact ? 'text-[10px]' : 'text-xs')}>مؤرشفة خارجياً</span>
      {!compact && (
        <>
          <span className="max-w-full truncate font-mono text-[10px] text-slate-600" dir="ltr">{info.package_code}</span>
          <span className="text-[10px] text-slate-500">{info.disks.length > 0 ? `القرص: ${info.disks.join('، ')}` : 'بلا قرص مسجّل'}</span>
          <span className="text-[10px] text-slate-500">حُذفت من المنصة {formatDate(info.purged_at)}</span>
        </>
      )}
    </div>
  )
}

/**
 * صورة واعية بالأرشيف: `url` موجود ⇒ <img>؛ `missing` (فشل التوقيع/غير موجودة) ⇒ استعلام الأرشيف ⇒ بطاقة أو البديل.
 * `fallback` يُعرض أثناء التحميل وعندما لا تكون الصورة مؤرشفة (مفقودة لسبب آخر).
 */
export function ArchiveAwarePhoto({ bucket, path, url, missing, alt, className, imgClassName, compact, fallback, onClick }: {
  bucket: string; path: string | null | undefined; url: string | null | undefined; missing: boolean
  alt: string; className?: string; imgClassName?: string; compact?: boolean; fallback?: ReactNode; onClick?: () => void
}) {
  const lookup = useArchivedLookup(bucket, path ? [path] : [], missing && !url)
  if (url) return <img src={url} alt={alt} className={imgClassName ?? className} loading="lazy" onClick={onClick} />
  const info = path ? lookup.data[path] : undefined
  if (info) return <ArchivedFileCard info={info} className={className} compact={compact} />
  return <>{fallback ?? null}</>
}
