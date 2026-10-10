/**
 * 00200 — أغلفة القوالب الجاهزة (ديناميكية).
 * تسعة تصاميم اعتمدها المستخدم (الخلفيات في public/report-assets/covers/c1..c9.jpg بعد تفريغ منطقة النص منها)
 * تُركَّب فوقها طبقة نصوص حيّة من بيانات التصميم: نوع التقرير (الانجاز اليومي/الأسبوعي/…)، البلدية (الكرادة/الزعفرانية)،
 * التاريخ (ليوم Y/M/D أو من … إلى …) والشفت (صباحي/ليلي). يُحفظ الغلاف في التصميم بمسار نصي `builtin:<id>`.
 * كل ما هنا نقي (بلا React) ليُختبر مباشرة.
 */
import type { PeriodType, SectorParent } from '../constants'

export type CoverShift = 'morning' | 'night'
export const SHIFT_LABEL: Record<CoverShift, string> = { morning: 'الشفت الصباحي', night: 'الشفت الليلي' }
export const SHIFT_OPTIONS: Array<{ value: CoverShift | ''; label: string }> = [
  { value: '', label: 'بلا شفت' },
  { value: 'morning', label: 'الشفت الصباحي' },
  { value: 'night', label: 'الشفت الليلي' },
]

export const BUILTIN_PREFIX = 'builtin:'
export const isBuiltinCover = (path: string | null | undefined): path is string => !!path && path.startsWith(BUILTIN_PREFIX)
export const builtinCoverId = (path: string | null | undefined): string | null => (isBuiltinCover(path) ? path.slice(BUILTIN_PREFIX.length) : null)
export const builtinCoverPath = (id: string) => `${BUILTIN_PREFIX}${id}`

export interface CoverPalette {
  /** لون سطر «الانجاز اليومي» */
  headline: string
  /** خلفية شريط البلدية (تدرج) + لون نصه + لون الحافة الذهبية */
  bandBg: string
  bandText: string
  bandEdge: string
  /** لون سطر التاريخ والخطوط الجانبية */
  date: string
  rule: string
  /** حبّة الشفت */
  pillBg: string
  pillText: string
  pillBorder: string
}

export interface CoverTemplateDef {
  id: string
  title: string
  /** مسار الخلفية (public) */
  bg: string
  tone: 'light' | 'dark'
  /** منطقة النصوص بالنسبة المئوية من الورقة (x, y, w, h) */
  zone: { x: number; y: number; w: number; h: number }
  /** band = شريط مائل للبلدية (كما في معظم التصاميم) · plain = نص البلدية بلا شريط */
  layout: 'band' | 'plain'
  /** محاذاة الكتلة داخل المنطقة */
  align: 'center' | 'end'
  /** الشفت الافتراضي الذي صُمّم له (للترشيح فقط) */
  shiftHint: CoverShift | null
  /** مقياس الخط للمناطق الضيقة (افتراضي 1) */
  fontScale?: number
  palette: CoverPalette
}

const NAVY = '#152b5c'
const GOLD = '#d9a441'
const LIGHT: CoverPalette = {
  headline: NAVY,
  bandBg: `linear-gradient(90deg, #0f1f45 0%, ${NAVY} 60%, #1d3a7a 100%)`,
  bandText: '#f3c15c',
  bandEdge: GOLD,
  date: NAVY,
  rule: GOLD,
  pillBg: `linear-gradient(90deg, #0f1f45, #1d3a7a)`,
  pillText: '#ffffff',
  pillBorder: GOLD,
}
const DARK: CoverPalette = {
  headline: '#ffffff',
  bandBg: 'linear-gradient(90deg, #1e4fa3 0%, #2a6fd6 100%)',
  bandText: '#ffb547',
  bandEdge: '#ff8c1a',
  date: '#ffffff',
  rule: '#7fb2ff',
  pillBg: 'rgba(10, 30, 80, 0.85)',
  pillText: '#ffffff',
  pillBorder: '#ff8c1a',
}
const DARK_GOLD: CoverPalette = { ...DARK, bandBg: `linear-gradient(90deg, #c9952f, ${GOLD})`, bandText: NAVY, bandEdge: '#f3c15c', rule: GOLD, pillBorder: GOLD }

export const COVER_TEMPLATES: CoverTemplateDef[] = [
  { id: 'c1', title: 'ليل بغداد — الشاحنة', bg: '/report-assets/covers/c1.jpg', tone: 'dark', zone: { x: 4, y: 18, w: 92, h: 33 }, layout: 'band', align: 'center', shiftHint: 'night', palette: DARK },
  { id: 'c2', title: 'نهر دجلة — نهاري', bg: '/report-assets/covers/c2.jpg', tone: 'light', zone: { x: 4, y: 20, w: 92, h: 40 }, layout: 'band', align: 'center', shiftHint: 'morning', palette: LIGHT },
  { id: 'c3', title: 'الجسر — نهاري', bg: '/report-assets/covers/c3.jpg', tone: 'light', zone: { x: 4, y: 22, w: 92, h: 40 }, layout: 'band', align: 'center', shiftHint: 'morning', palette: LIGHT },
  { id: 'c4', title: 'البطاقة البيضاء', bg: '/report-assets/covers/c4.jpg', tone: 'light', zone: { x: 12, y: 20, w: 76, h: 52 }, layout: 'band', align: 'center', shiftHint: null, fontScale: 0.74, palette: { ...LIGHT, bandBg: `linear-gradient(90deg, #c9952f, ${GOLD})`, bandText: NAVY } },
  { id: 'c5', title: 'ليل بغداد — الجسر', bg: '/report-assets/covers/c5.jpg', tone: 'dark', zone: { x: 6, y: 22, w: 88, h: 33 }, layout: 'band', align: 'center', shiftHint: 'night', palette: DARK_GOLD },
  { id: 'c6', title: 'شروق دجلة', bg: '/report-assets/covers/c6.jpg', tone: 'light', zone: { x: 6, y: 18, w: 88, h: 32 }, layout: 'band', align: 'center', shiftHint: 'morning', palette: LIGHT },
  { id: 'c7', title: 'الأفق الأزرق', bg: '/report-assets/covers/c7.jpg', tone: 'light', zone: { x: 4, y: 22, w: 92, h: 41 }, layout: 'band', align: 'center', shiftHint: null, palette: LIGHT },
  { id: 'c8', title: 'البرج — نص جانبي', bg: '/report-assets/covers/c8.jpg', tone: 'light', zone: { x: 3, y: 22, w: 69, h: 34 }, layout: 'plain', align: 'end', shiftHint: null, fontScale: 0.78, palette: { ...LIGHT, bandText: '#c58a1f' } },
  { id: 'c9', title: 'القوس الذهبي — ليلي', bg: '/report-assets/covers/c9.jpg', tone: 'dark', zone: { x: 57, y: 25, w: 40, h: 42 }, layout: 'plain', align: 'center', shiftHint: 'night', fontScale: 0.55, palette: { ...DARK, bandText: '#f3c15c', pillBg: 'rgba(255,255,255,0.08)', pillBorder: GOLD } },
]

export const coverTemplateById = (id: string | null | undefined): CoverTemplateDef | undefined => COVER_TEMPLATES.find((t) => t.id === id)

export interface CoverContext {
  periodType: PeriodType
  sector: SectorParent
  periodStart: string
  periodEnd: string
  shift: CoverShift | null
}
export interface CoverTexts {
  headline: string
  municipality: string
  date: string
  shift: string | null
}

const HEADLINE: Record<PeriodType, string> = {
  daily: 'الانجاز اليومي',
  weekly: 'الانجاز الأسبوعي',
  first_half: 'الانجاز النصف شهري',
  second_half: 'الانجاز النصف شهري',
  monthly: 'الانجاز الشهري',
}
const MUNICIPALITY: Record<SectorParent, string> = { karrada: 'بلدية الكرادة', zaafaraniya: 'بلدية الزعفرانية' }

/** 2026-10-07 → 2026/10/7 (أرقام لاتينية كما في التصميم المعتمد) */
export function slashYmd(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}`
}

/** النصوص الحيّة للغلاف من بيانات التصميم (نقي) */
export function coverTexts(ctx: CoverContext): CoverTexts {
  const daily = ctx.periodType === 'daily' || ctx.periodStart === ctx.periodEnd
  return {
    headline: HEADLINE[ctx.periodType],
    municipality: MUNICIPALITY[ctx.sector],
    date: daily ? `ليوم ${slashYmd(ctx.periodStart)}` : `من ${slashYmd(ctx.periodStart)} إلى ${slashYmd(ctx.periodEnd)}`,
    shift: ctx.shift ? SHIFT_LABEL[ctx.shift] : null,
  }
}

/** ترتيب القوالب للعرض: ما يناسب شفت التصميم أولاً ثم العامة ثم الباقي */
export function rankTemplates(templates: CoverTemplateDef[], shift: CoverShift | null): CoverTemplateDef[] {
  const score = (t: CoverTemplateDef) => (t.shiftHint === shift ? 0 : t.shiftHint === null ? 1 : 2)
  return [...templates].sort((a, b) => score(a) - score(b))
}
