/** عرض صورة حاوية عبر رابط مؤقت (يُحمّل عند الظهور) */
import { useEffect, useState } from 'react'
import { gbs } from '@sdk/gbs.sdk'

export default function SignedPhoto({
  path,
  alt,
  className = 'h-24 w-full rounded-xl object-cover',
}: {
  path: string
  alt: string
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void gbs
      .imageUrl(path)
      .then((signed) => {
        if (alive) setUrl(signed)
      })
      .catch(() => {
        if (alive) setUrl(null)
      })
    return () => {
      alive = false
    }
  }, [path])
  if (!url)
    return (
      <div className={`${className} flex items-center justify-center bg-slate-100 text-[10px] font-bold text-slate-400`}>
        جارٍ تحميل الصورة…
      </div>
    )
  return <img src={url} alt={alt} className={className} data-testid="gbs-photo" />
}
