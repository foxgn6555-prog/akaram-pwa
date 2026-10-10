/**
 * 00200 — عرض غلاف قالب جاهز بنصوص حيّة.
 * الورقة بنسبة A4؛ القياسات كلها بوحدة cqw (نسبة من عرض الحاوية) فتبقى الطباعة والمصغّرات والتصدير بنفس التناسب.
 */
import { CalendarDays, Moon, Sun } from 'lucide-react'
import { coverTexts, type CoverContext, type CoverTemplateDef } from '@features/media/lib/cover-templates'

export default function CoverTemplate({ def, ctx, className = '', style }: { def: CoverTemplateDef; ctx: CoverContext; className?: string; style?: React.CSSProperties }) {
  const t = coverTexts(ctx)
  const p = def.palette
  const z = def.zone
  const ShiftIcon = ctx.shift === 'morning' ? Sun : Moon
  const plain = def.layout === 'plain'
  const fontScale = def.fontScale ?? 1
  const rule = <span aria-hidden style={{ flex: '0 0 auto', width: '9cqw', height: '0.35cqw', background: p.rule, borderRadius: '1cqw' }} />
  return (
    <div
      data-cover-template={def.id}
      data-testid={`cover-template-${def.id}`}
      dir="rtl"
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: '210 / 297', containerType: 'inline-size', background: `#fff url(${def.bg}) center / cover no-repeat`, fontFamily: "'Cairo', 'Tajawal', system-ui, sans-serif", ...style }}
    >
      <img src={def.bg} alt="" aria-hidden className="absolute inset-0 size-full object-cover" draggable={false} />
      <div
        className="absolute flex flex-col"
        style={{
          left: `${z.x}%`,
          top: `${z.y}%`,
          width: `${z.w}%`,
          height: `${z.h}%`,
          alignItems: def.align === 'end' ? 'flex-start' : 'center',
          justifyContent: 'space-evenly',
          textAlign: def.align === 'end' ? 'right' : 'center',
        }}
      >
        {/* الانجاز اليومي */}
        <div className="flex w-full items-center justify-center" style={{ gap: '2.5cqw', justifyContent: def.align === 'end' ? 'flex-start' : 'center' }}>
          {!plain && rule}
          <span data-testid="cover-headline" style={{ color: p.headline, fontWeight: 900, fontSize: `${7.2 * fontScale}cqw`, lineHeight: 1.25, whiteSpace: 'nowrap', textShadow: def.tone === 'dark' ? '0 0.3cqw 1cqw rgba(0,0,0,.45)' : 'none' }}>
            {t.headline}
          </span>
          {!plain && rule}
        </div>

        {/* بلدية … */}
        {plain ? (
          <span data-testid="cover-municipality" style={{ color: p.bandText, fontWeight: 900, fontSize: `${7.8 * fontScale}cqw`, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            {t.municipality}
          </span>
        ) : (
          <div
            data-testid="cover-municipality"
            style={{
              background: p.bandBg,
              color: p.bandText,
              fontWeight: 900,
              fontSize: `${9 * fontScale}cqw`,
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              padding: '1.6cqw 7cqw',
              borderRadius: '2.2cqw',
              transform: 'skewX(-8deg)',
              boxShadow: `inset 1.1cqw 0 0 ${p.bandEdge}, 0 1cqw 2.5cqw rgba(0,0,0,.25)`,
              maxWidth: '100%',
            }}
          >
            <span style={{ display: 'inline-block', transform: 'skewX(8deg)' }}>{t.municipality}</span>
          </div>
        )}

        {/* ليوم … */}
        <div className="flex items-center" style={{ gap: '2cqw', color: p.date, fontWeight: 800, fontSize: `${4.6 * fontScale}cqw`, whiteSpace: 'nowrap' }} data-testid="cover-date">
          <span dir="rtl">{t.date}</span>
          <span aria-hidden style={{ width: '0.3cqw', height: '5cqw', background: p.rule, opacity: 0.8 }} />
          <CalendarDays aria-hidden style={{ width: '5.2cqw', height: '5.2cqw' }} />
        </div>

        {/* الشفت */}
        {t.shift && (
          <div className="flex items-center" style={{ gap: '2.5cqw', justifyContent: 'center' }}>
            {!plain && rule}
            <div
              data-testid="cover-shift"
              className="flex items-center"
              style={{ gap: '2cqw', background: p.pillBg, color: p.pillText, border: `0.4cqw solid ${p.pillBorder}`, borderRadius: '99cqw', padding: '1.2cqw 5cqw', fontWeight: 900, fontSize: `${4.8 * fontScale}cqw`, whiteSpace: 'nowrap', boxShadow: '0 0.8cqw 2cqw rgba(0,0,0,.25)' }}
            >
              <span>{t.shift}</span>
              <span aria-hidden style={{ width: '0.3cqw', height: '5cqw', background: p.pillBorder, opacity: 0.8 }} />
              <ShiftIcon aria-hidden style={{ width: '5cqw', height: '5cqw', color: ctx.shift === 'morning' ? '#ffb547' : '#f3c15c' }} />
            </div>
            {!plain && rule}
          </div>
        )}
      </div>
    </div>
  )
}
