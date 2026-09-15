/**
 * شبكة صور معروضة/قابلة للتحديد — تعمل حتى 500 صورة
 * (روابط موقّتة بدفعة واحدة + «عرض المزيد» لتفادي الضغط)
 */
import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { useSignedPhotoUrls } from '@features/media/hooks'

interface PhotoGridItem {
  id: string
  path: string
  caption?: string | null
}

interface PhotoGridProps {
  items: PhotoGridItem[]
  selectable?: boolean
  selected?: Set<string>
  onToggle?: (id: string) => void
  pageSize?: number
}

export default function PhotoGrid({
  items,
  selectable = false,
  selected,
  onToggle,
  pageSize = 60,
}: PhotoGridProps) {
  const [visible, setVisible] = useState(pageSize)
  useEffect(() => {
    setVisible(pageSize)
  }, [items, pageSize])

  const shown = items.slice(0, visible)
  const urlsQ = useSignedPhotoUrls(shown.map((p) => p.path))
  const urls = urlsQ.data ?? {}

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map((item) => {
          const url = urls[item.path]
          const isSel = selectable && Boolean(selected?.has(item.id))
          return (
            <figure
              key={item.id}
              className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-slate-100 ${
                isSel ? 'border-emerald-600' : 'border-transparent'
              }`}
            >
              {url ? (
                <img
                  src={url}
                  alt={item.caption ?? 'صورة'}
                  loading="lazy"
                  className="size-full object-cover"
                  onClick={() => selectable && onToggle?.(item.id)}
                />
              ) : (
                <div className="flex size-full items-center justify-center text-slate-300">
                  <ImageOff size={24} />
                </div>
              )}
              {selectable && (
                <button
                  type="button"
                  aria-label={isSel ? 'إلغاء التحديد' : 'تحديد الصورة'}
                  onClick={() => onToggle?.(item.id)}
                  className={`absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full border text-[11px] font-black transition ${
                    isSel
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-white/80 bg-slate-900/50 text-white hover:bg-slate-900/80'
                  }`}
                >
                  {isSel ? '✓' : '+'}
                </button>
              )}
              {item.caption && (
                <figcaption className="absolute inset-x-0 bottom-0 truncate bg-slate-950/60 px-2 py-1 text-[10px] text-white">
                  {item.caption}
                </figcaption>
              )}
            </figure>
          )
        })}
      </div>
      {items.length > visible && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize)}
          className="mt-3 h-10 w-full rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          عرض المزيد ({items.length - visible} صورة متبقية)
        </button>
      )}
    </div>
  )
}
