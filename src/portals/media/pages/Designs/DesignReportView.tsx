/**
 * عرض التصميم الاحترافي — مطابق لبنية التقرير المصور:
 *  · الورقة الأولى: الغلاف (صورة يرفعها مسؤول الإعلام)
 *  · الورقة الثانية: تقرير رسمي يُعبأ من النظام (الجهة/الموضوع/التاريخ + الفعاليات)
 *  · لوحات صور لكل نوع عمل (صف = نوع عمل بإنجازاته)
 * قابل للطباعة/التصدير PDF مباشرة من المتصفح
 */
import { useMemo } from 'react'
import {
  PERIOD_LABEL,
  SECTOR_LABEL,
  periodRange,
  type PeriodType,
  type SectorParent,
} from '@features/media/constants'
import { useSignedPhotoUrls } from '@features/media/hooks'

interface DesignReportData {
  title: string
  sector: SectorParent
  periodType: PeriodType
  periodStart: string
  periodEnd: string
  coverUrl?: string | null
  /** مجموعات صور التصميم: نوع العمل ← صور */
  groups: Array<{ workType: string; photos: Array<{ id: string; path: string; caption?: string | null }> }>
}

const fmtDate = (x: string) =>
  new Intl.DateTimeFormat('ar-IQ', { dateStyle: 'long', timeZone: 'Asia/Baghdad' }).format(new Date(x))

export default function DesignReportView({
  title,
  sector,
  periodType,
  periodStart,
  periodEnd,
  coverUrl,
  groups,
}: DesignReportData) {
  const allPaths = useMemo(() => groups.flatMap((g) => g.photos.map((p) => p.path)), [groups])
  const urls = useSignedPhotoUrls(allPaths)
  const range = periodRange(periodType)
  const start = periodStart || range.start
  const end = periodEnd || range.end
  const totalPhotos = allPaths.length

  return (
    <div id="design-report" className="design-report bg-white" dir="rtl">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #design-report, #design-report * { visibility: visible; }
          #design-report { position: absolute; inset: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* الترويسة الرسمية */}
      <header className="border-b-4 border-sky-700 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid size-14 place-items-center rounded-full bg-sky-700 text-lg font-black text-white">
              ج
            </span>
            <span className="grid size-14 place-items-center rounded-full border-4 border-sky-700 bg-amber-400 text-lg font-black text-sky-900">
              ف
            </span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black text-sky-900">شركة جزيرة الاكارم وفيرست تراد</h1>
            <p className="text-sm font-bold text-sky-800">
              التقرير المصور — {PERIOD_LABEL[periodType]} / {SECTOR_LABEL[sector]}
            </p>
          </div>
          <span className="grid size-14 place-items-center rounded-full border-2 border-sky-700 text-center text-[8px] font-black leading-tight text-sky-800">
            بلدية
            <br />
            بغداد
          </span>
        </div>

        {/* جدول الجهة/الموضوع/التاريخ */}
        <table className="mt-4 w-full border-collapse text-sm">
          <tbody>
            <tr className="bg-sky-900 text-white">
              <td className="border border-sky-800 px-3 py-2 font-black">الجهة المنظمة للتقرير</td>
              <td className="border border-sky-800 px-3 py-2">شركة جزيرة الاكارم وفيرست تراد</td>
            </tr>
            <tr className="bg-sky-700 text-white">
              <td className="border border-sky-600 px-3 py-2 font-black">موضوع التقرير</td>
              <td className="border border-sky-600 px-3 py-2">
                التقرير اليومي المصورة لفعاليات {SECTOR_LABEL[sector]} — {title}
              </td>
            </tr>
            <tr className="bg-amber-500 text-slate-900">
              <td className="border border-amber-400 px-3 py-2 font-black">التاريخ</td>
              <td className="border border-amber-400 px-3 py-2 font-bold">
                من {fmtDate(start)} إلى {fmtDate(end)}
              </td>
            </tr>
          </tbody>
        </table>
      </header>

      {/* الورقة الأولى: الغلاف */}
      {coverUrl && (
        <section className="mt-4">
          <img src={coverUrl} alt="غلاف التقرير" className="max-h-105 w-full rounded-xl object-cover" />
        </section>
      )}

      {/* الفعاليات المنجزة */}
      <section className="mt-5">
        <h2 className="mb-2 bg-slate-900 px-3 py-2 text-sm font-black text-white">الفعاليات المنجزة</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-sky-100">
              <th className="w-10 border border-sky-300 px-2 py-2">ت</th>
              <th className="w-32 border border-sky-300 px-2 py-2">اسم القاطع</th>
              <th className="border border-sky-300 px-3 py-2 text-right">نوع العمل المنجز</th>
              <th className="w-24 border border-sky-300 px-2 py-2">عدد الصور</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={g.workType} className={i % 2 ? 'bg-sky-50/50' : ''}>
                <td className="border border-sky-300 px-2 py-2 text-center">{i + 1}</td>
                <td className="border border-sky-300 px-2 py-2 text-center font-bold text-sky-900">
                  {SECTOR_LABEL[sector]}
                </td>
                <td className="border border-sky-300 px-3 py-2">{g.workType}</td>
                <td className="border border-sky-300 px-2 py-2 text-center">{g.photos.length}</td>
              </tr>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan={4} className="border border-sky-300 px-3 py-6 text-center text-slate-400">
                  لم تُحدد صور لهذا التصميم بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* لوحات الصور: كل نوع عمل = لوحة بإنجازاته */}
      {groups.map((g) => (
        <section key={`panel-${g.workType}`} className="mt-6">
          <h3 className="mb-2 flex items-center gap-2 border-r-4 border-sky-700 bg-sky-50 px-3 py-2 text-sm font-black text-sky-900">
            {g.workType}
            <span className="rounded-full bg-sky-700 px-2 py-0.5 text-[10px] text-white">
              {g.photos.length} صورة
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {g.photos.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <div className="aspect-video bg-slate-100">
                  {urls[p.path] ? (
                    <img src={urls[p.path]} alt={p.caption ?? g.workType} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <div className="grid size-full place-items-center text-xs text-slate-300">…</div>
                  )}
                </div>
                {p.caption && (
                  <figcaption className="truncate px-2 py-1 text-[10px] font-bold text-slate-600">{p.caption}</figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      ))}

      {/* التذييل */}
      <footer className="mt-8 border-t-4 border-sky-700 pt-3">
        <p className="text-center text-sm font-black text-sky-900">
          لجنة الإشراف والمتابعة — بلدية {sector === 'karrada' ? 'الكرادة' : 'الزعفرانية'}
        </p>
        <p className="mt-1 text-center text-[10px] text-slate-400">
          إجمالاً {totalPhotos} صورة موثقة في هذا التصميم
        </p>
      </footer>
    </div>
  )
}
