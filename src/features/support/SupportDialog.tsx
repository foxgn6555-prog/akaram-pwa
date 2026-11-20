/**
 * الجولة ٥ — نافذة «الدعم الفني» الموحّدة (متاحة من كل البوابات).
 * تذكرة نصية + حتى ٣ صور، تُحفظ في support_tickets وتُبلّغ تقنية المعلومات.
 * الصور تُرفع في مجلد صاحبها فقط، والخادم يرفض أي مسار خارج مجلد المستخدم.
 */
import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LifeBuoy, Phone, Send, Trash2, X } from 'lucide-react'
import {
  useCreateTicket,
  useSupportContact,
} from '@features/support/hooks'
import type { SupportCategory, SupportPriority } from '@sdk/support.sdk'

const CATEGORIES: { value: SupportCategory; label: string }[] = [
  { value: 'hardware', label: 'جهاز / طابعة' },
  { value: 'software', label: 'برنامج / نظام' },
  { value: 'network', label: 'شبكة / إنترنت' },
  { value: 'account', label: 'حساب / دخول' },
  { value: 'other', label: 'أخرى' },
]

const PRIORITIES: { value: SupportPriority; label: string }[] = [
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
  { value: 'critical', label: 'حرجة' },
]

const MAX_IMAGES = 3

export function SupportDialog({
  open,
  onClose,
  portal,
}: {
  open: boolean
  onClose: () => void
  portal?: string
}) {
  const contact = useSupportContact()
  const create = useCreateTicket()
  const fileRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SupportCategory>('other')
  const [priority, setPriority] = useState<SupportPriority>('medium')
  const [phone, setPhone] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const reset = (): void => {
    setTitle('')
    setDescription('')
    setCategory('other')
    setPriority('medium')
    setPhone('')
    setFiles([])
    setError('')
  }

  const addFiles = (picked: FileList | null): void => {
    if (!picked) return
    const next = [...files]
    for (const file of Array.from(picked)) {
      if (!file.type.startsWith('image/')) {
        setError('المرفقات صور فقط (JPG أو PNG أو WebP)')
        continue
      }
      if (next.length >= MAX_IMAGES) {
        setError(`الحد الأقصى ${MAX_IMAGES} صور`)
        break
      }
      next.push(file)
    }
    setFiles(next)
  }

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (title.trim().length < 3) return setError('اكتب عنواناً موجزاً (٣ أحرف على الأقل)')
    if (description.trim().length < 3) return setError('اكتب وصفاً للمشكلة')
    setError('')
    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        portal: portal ?? null,
        phone: phone.trim() || null,
        files,
      },
      {
        onSuccess: () => {
          reset()
          onClose()
        },
      },
    )
  }

  const info = contact.data

  return (
    <>
      <button
        type="button"
        aria-label="إغلاق"
        data-testid="support-backdrop"
        className="fixed inset-0 z-[60] cursor-default bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="الدعم الفني"
        data-testid="support-dialog"
        className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:inset-y-0 sm:bottom-auto sm:top-1/2 sm:max-h-[85vh] sm:-translate-y-1/2 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-800">
              <LifeBuoy size={18} className="text-brand-600" />
              الدعم الفني
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              أرسل طلبك إلى تقنية المعلومات. تصل التذكرة إليهم فوراً ويصلك الردّ في إشعاراتك.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5 font-bold">
            <Phone size={13} className="text-brand-600" />
            <span dir="ltr">{info?.phone ?? '—'}</span>
          </span>
          {info?.hours && <span>ساعات العمل: {info.hours}</span>}
          <span className={info?.online ? 'text-emerald-700' : 'text-slate-400'}>
            {info?.online ? 'الدعم متاح الآن' : 'خارج وقت الدعم — تُحفظ التذكرة وتُعالج لاحقاً'}
          </span>
        </div>

        <form className="mt-3 space-y-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-[11px] font-bold text-slate-600">
              النوع
              <select
                data-testid="support-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as SupportCategory)}
                className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-800"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] font-bold text-slate-600">
              الأهمية
              <select
                data-testid="support-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as SupportPriority)}
                className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-800"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-[11px] font-bold text-slate-600">
            العنوان
            <input
              data-testid="support-title"
              value={title}
              maxLength={150}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: الطابعة لا تطبع"
              className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800"
            />
          </label>

          <label className="block text-[11px] font-bold text-slate-600">
            وصف المشكلة
            <textarea
              data-testid="support-description"
              value={description}
              maxLength={4000}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ماذا حدث؟ ومنذ متى؟"
              className="mt-1 w-full resize-y rounded-xl border border-slate-200 p-3 text-xs leading-6 text-slate-800"
            />
          </label>

          <label className="block text-[11px] font-bold text-slate-600">
            رقم للتواصل (اختياري)
            <input
              data-testid="support-phone"
              value={phone}
              dir="ltr"
              maxLength={20}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07xxxxxxxxx"
              className="mt-1 h-9 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800"
            />
          </label>

          <div className="rounded-xl border border-dashed border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-bold text-slate-600">
                صور توضيحية (حتى {MAX_IMAGES})
              </p>
              <button
                type="button"
                data-testid="support-add-image"
                disabled={files.length >= MAX_IMAGES}
                onClick={() => fileRef.current?.click()}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
              >
                <ImagePlus size={13} /> إضافة صورة
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                data-testid="support-file-input"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1" data-testid="support-file-list">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                    <span className="truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label="حذف الصورة"
                      onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && (
            <p data-testid="support-error" className="rounded-lg bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="support-submit"
            disabled={create.isPending}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-xs font-black text-white disabled:opacity-50"
          >
            <Send size={14} />
            {create.isPending ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
          </button>
        </form>
      </div>
    </>
  )
}
