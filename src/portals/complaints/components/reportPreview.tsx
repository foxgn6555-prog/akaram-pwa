/**
 * مكونات معاينة تقرير الشكاوى — تعكس هيئة شرائح ملف PowerPoint المنتج.
 * الصيغ والخطة المشتركة في `reportPreviewModel.ts`.
 */
import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { siteCaption, type ReportEntry, type ReportLayout } from './reportPreviewModel'
import { coverBackgroundUrl, coverTexts, reportTheme, type ReportTheme } from '@lib/pptx/complaintCovers'
import { dateTimeLabels } from '@lib/pptx/complaintPptx'

export function ReportPreviewImage({ title, src, accent }: { title: string; src?: string; accent: string }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return <div className="overflow-hidden rounded-lg border">
    <div className="p-1 text-center text-[8px] font-bold text-white sm:text-xs" style={{ background: accent }}>{title}</div>
    {showImage
      ? <img src={src} alt={title} onError={() => setFailed(true)} className="aspect-[4/3] w-full bg-slate-100 object-contain" />
      : <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-slate-100 text-[8px] text-slate-400 sm:text-xs"><ImageIcon size={18} /><span>الصورة غير متاحة</span></div>}
  </div>
}

/** حجم خط بالنقاط على شريحة عرضها 960pt → نسبة من عرض حاوية المعاينة (يتطابق مع PowerPoint). */
const pt = (points: number) => `${(points / 960 * 100).toFixed(2)}cqw`

/** زخرفة الصفحات الداخلية عند اختيار غلاف ملصق: زاويتان مائلتان بلون الهوية فوق شريط ذهبي + خط ذهبي سفلي. */
export function ReportPageDecor({ theme }: { theme: ReportTheme }) {
  if (!theme.styled) return null
  const corner = (flip: boolean, color: string, w: string, h: string) => <span aria-hidden className="pointer-events-none absolute" style={{
    [flip ? 'bottom' : 'top']: 0, [flip ? 'right' : 'left']: 0, width: w, height: h, background: color,
    clipPath: flip ? 'polygon(100% 0, 100% 100%, 0 100%)' : 'polygon(0 0, 100% 0, 0 100%)',
  }} />
  return <>
    {corner(false, theme.gold, '20%', '9%')}{corner(false, theme.primary, '17%', '8%')}
    {corner(true, theme.gold, '20%', '9%')}{corner(true, theme.primary, '17%', '8%')}
    <span aria-hidden className="pointer-events-none absolute inset-x-[3%] bottom-[1%] h-[2px]" style={{ background: theme.gold }} />
  </>
}

export function ReportCoverPreview({ layout, title, accent, sector, reportDate }: {
  layout: ReportLayout; title: string; accent: string; sector: string; reportDate: string
}) {
  const theme = reportTheme(layout)
  const cover = theme.cover
  const texts = coverTexts(layout, { sector, reportDate })
  const background = coverBackgroundUrl(cover)
  const fontSize = Math.min(42, Math.max(20, Number(layout.coverFontSize ?? 30)))
  if (background) {
    const z = cover.zone
    return <div data-testid="cover-poster" data-cover={cover.id} className="relative h-full w-full overflow-hidden bg-slate-200" style={{ containerType: 'inline-size' }} dir="rtl">
      <img src={background} alt="" className="absolute inset-0 h-full w-full object-fill" />
      <div className="absolute flex flex-col items-center justify-between text-center" style={{ top: `${z.top * 100}%`, bottom: `${(1 - z.bottom) * 100}%`, left: `${z.left * 100}%`, right: `${(1 - z.right) * 100}%` }}>
        <p className="font-black" style={{ color: theme.ink, fontSize: pt(17) }}>{texts.authorityLine}</p>
        <p className="font-black" style={{ color: theme.ink, fontSize: pt(15) }}>{texts.contractorLine}</p>
        <h3 className="font-black leading-tight" style={{ color: theme.primary, fontSize: pt(fontSize) }}>{texts.title}</h3>
        <p className="font-black" style={{ color: theme.ink, fontSize: pt(18) }}>{texts.dateLine}</p>
        <p className="font-black" style={{ color: theme.sector, fontSize: pt(20) }}>{texts.sectorLine}</p>
        {texts.slogan ? <p className="font-black italic" style={{ color: theme.gold, fontSize: pt(12) }}>{texts.slogan}</p> : <span />}
      </div>
    </div>
  }
  return <div data-testid="cover-poster" data-cover="official" className="flex h-full flex-col items-center justify-center p-5 text-center">
    <div className="flex items-center gap-3">
      <img src="/icons/baghdad-municipality.png" alt="شعار أمانة بغداد" className="size-12 object-contain sm:size-16" />
      <img src="/icons/alliance.png" alt="شعار التحالف" className="size-14 object-contain sm:size-20" />
      <img src="/icons/logo.png" alt="شعار جزيرة الأكارم" className="size-14 object-contain sm:size-20" />
    </div>
    <p className="mt-3 text-[9px] font-bold sm:text-xs">{texts.authorityLine}</p>
    <p className="mt-1 text-[8px] font-bold sm:text-[11px]">{texts.contractorLine}</p>
    <h3 className="mt-4 max-w-2xl text-base font-black sm:text-2xl" style={{ color: accent }}>{texts.title}</h3>
    <p className="mt-2 max-w-2xl text-[9px] font-bold text-slate-700 sm:text-sm">{title}</p>
    <p className="mt-2 text-[10px] font-bold sm:text-sm">{texts.sectorLine} - {texts.dateLine.replace(/^التاريخ\s*:\s*/, '')}</p>
    {texts.slogan && <p className="mt-2 text-[9px] font-bold sm:text-xs" style={{ color: accent }}>{texts.slogan}</p>}
  </div>
}

export function ReportTablePreview({ entries, accent, layout }: { entries: ReportEntry[]; accent: string; layout?: ReportLayout }) {
  const theme = reportTheme(layout ?? {})
  return <div className="relative h-full overflow-y-auto p-3 sm:p-5"><ReportPageDecor theme={theme} />
    <h3 className="text-center text-xs font-black sm:text-lg" style={{ color: accent }}>جدول بيانات التلكؤات</h3>
    {theme.styled && <span aria-hidden className="mx-auto mt-1 block h-[2px] w-24" style={{ background: theme.gold }} />}
    <table className="mt-3 w-full table-fixed text-[6px] sm:text-[10px]">
      <thead style={{ background: accent, color: 'white' }}><tr><th className="p-1">ت</th><th>التاريخ</th><th>رقم المحلة</th><th>رقم الزقاق</th><th>المركز البلدي</th><th>نوع التلكؤ</th><th>وقت وصول الشكوى</th></tr></thead>
      <tbody>{entries.slice(0, 11).map((entry, index) => {
        const labels = dateTimeLabels(entry.item.receivedAt)
        return <tr key={entry.itemId} className="border-b odd:bg-slate-50">
          <td className="p-1 text-center">{index + 1}</td>
          <td>{labels.dateLabel}</td>
          <td>{entry.item.neighborhood || '—'}</td>
          <td>{entry.item.alley || '—'}</td>
          <td>{entry.item.municipalCenter || '—'}</td>
          <td>{entry.item.title || '—'}</td>
          <td>{labels.arrivalLabel}</td>
        </tr>
      })}</tbody>
    </table>
    {entries.length > 11 && <p className="mt-2 text-center text-[8px] text-slate-500">+ {entries.length - 11} موقع في الصفحات التالية</p>}
  </div>
}

export function ReportSlidePreview({ entry, before, after, accent, layout }: {
  entry?: ReportEntry; before?: string; after?: string; accent: string; layout: ReportLayout
}) {
  if (!entry) return <div className="flex h-full items-center justify-center text-sm text-slate-400">لا توجد مواقع مضمنة</div>
  const theme = reportTheme(layout)
  return <div className="relative flex h-full flex-col p-3"><ReportPageDecor theme={theme} />
    <div className="grid grid-cols-2 gap-3">
      <ReportPreviewImage title={String(layout.afterLabel ?? 'صورة المعالجة')} src={after} accent={accent} />
      <ReportPreviewImage title={String(layout.beforeLabel ?? 'صورة التلكؤ')} src={before} accent={accent} />
    </div>
    <p className="mt-auto rounded-lg p-2 text-center text-[8px] font-bold sm:text-xs" style={theme.styled ? { background: '#fff', border: `1px solid ${theme.gold}`, marginBottom: '3%' } : { background: '#f1f5f9' }}>{siteCaption(entry)}</p>
  </div>
}
