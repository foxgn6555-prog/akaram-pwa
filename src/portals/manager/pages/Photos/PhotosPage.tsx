/**
 * إرسال صور — رفع صور العمل الميداني مع وصف؛ تُعرض في معرض وتنتقل للأرشيف.
 * الصور في bucket خاص (sector-photos) وتُعرض برابط موقّت (signed URL).
 */
import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePhotos, useUploadPhoto } from '@features/sector'
import { sectorPhotos } from '@sdk/sector.sdk'
import { Icon } from '@components/ui/Icon/Icon'
import { CameraCapture } from '@components/ui'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'

export default function PhotosPage() {
  const photos = usePhotos('active')
  const upload = useUploadPhoto()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [camOpen, setCamOpen] = useState(false)

  const pick = (f: File | null): void => {
    setFile(f)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(f ? URL.createObjectURL(f) : null)
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!file) return
    upload.mutate(
      { file, caption: caption.trim() },
      {
        onSuccess: () => {
          setFile(null)
          setCaption('')
          if (preview) URL.revokeObjectURL(preview)
          setPreview(null)
          if (fileRef.current) fileRef.current.value = ''
        },
      },
    )
  }

  const list = photos.data ?? []

  return (
    <div className="space-y-5" data-testid="photos-page">
      <div>
        <h1 className="text-lg font-bold text-slate-800">إرسال صور</h1>
        <p className="text-sm text-slate-500">ارفع صوراً موثّقة للعمل الميداني مع وصف موجز — تُحفظ في الأرشيف.</p>
      </div>

      <form onSubmit={submit} data-testid="photo-form"
        className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" data-testid="f-photo-file"
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="h-11 min-w-0 flex-1 block text-sm file:me-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-brand-700" />
            <button type="button" onClick={() => setCamOpen(true)} data-testid="photo-camera"
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-brand-400 hover:text-brand-700">
              <Icon name="camera" size={16} /> كاميرا
            </button>
          </div>
          <input value={caption} onChange={(e) => setCaption(e.target.value)}
            placeholder="وصف الصورة (مثال: رفع أنقاض شارع الجمهورية)"
            data-testid="f-photo-caption"
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-brand-500" />
          <button type="submit" disabled={!file || upload.isPending} data-testid="photo-submit"
            className="flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50">
            <Icon name="upload" size={16} /> {upload.isPending ? 'جارٍ الرفع…' : 'رفع الصورة'}
          </button>
        </div>
        {preview && (
          <div className="flex items-center justify-center">
            <img src={preview} alt="معاينة" className="max-h-40 rounded-xl border border-slate-200 object-cover" />
          </div>
        )}
      </form>

      <div>
        <h2 className="mb-3 text-sm font-bold text-slate-700">المعرض ({list.length})</h2>
        {photos.isLoading ? <LoadingSpinner label="جارٍ الجلب…" /> :
          list.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white"><EmptyState title="لا توجد صور بعد" hint="ابدأ برفع أول صورة" /></div> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="photo-gallery">
              {list.map((p) => <PhotoCard key={p.id} id={p.id} path={p.storage_path} caption={p.caption} date={p.created_at} />)}
            </div>
          )}
      </div>

      {/* نافذة الكاميرا — الصورة الملتقطة تدخل نفس مسار المعاينة والرفع */}
      <CameraCapture
        open={camOpen}
        onClose={() => setCamOpen(false)}
        onCapture={(f) => pick(f)}
      />
    </div>
  )
}

function PhotoCard({ path, caption, date }: { id: string; path: string; caption: string | null; date: string | null }) {
  const q = useQuery({
    queryKey: ['sector-photo-url', path],
    queryFn: () => sectorPhotos.signedUrl(path),
    staleTime: 20 * 60 * 1000,
    enabled: !!path,
  })
  return (
    <figure className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-video bg-slate-100">
        {q.data ? (
          <img src={q.data} alt={caption ?? 'صورة'} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-400"><Icon name="photo" size={26} /></div>
        )}
      </div>
      <figcaption className="px-3 py-2">
        <div className="truncate text-xs font-medium text-slate-700">{caption ?? 'بدون وصف'}</div>
        <div className="text-[10px] text-slate-400">{(date ?? '').slice(0, 10)}</div>
      </figcaption>
    </figure>
  )
}
