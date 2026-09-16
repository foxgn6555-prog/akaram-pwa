/** ثوابت قوالب التقرير المصور: أشكال صفحات الصور، قوالب ورقة النص، ثيمات الجدول، والخطوط */
export type PhotoLayout = 'classic' | 'round' | 'stack' | 'mosaic'
export type SheetStyle = 'frame' | 'plain' | 'double'
export type SummaryTheme = 'blue' | 'green' | 'slate'
export type ReportFont = 'cairo' | 'tajawal' | 'amiri' | 'kufi'
export interface ReportStyle {
  photoLayout: PhotoLayout
  sheetStyle: SheetStyle
  summaryTheme: SummaryTheme
  font: ReportFont
}

export const PHOTO_LAYOUTS: Array<{ value: PhotoLayout; label: string }> = [
  { value: 'classic', label: 'شبكة 2×2 كلاسيكية' },
  { value: 'round', label: 'شبكة 2×2 بحواف دائرية' },
  { value: 'stack', label: 'عمود رباعي عريض' },
  { value: 'mosaic', label: 'فسيفساء: عنوان كبير + ثلاث' },
]
export const SHEET_STYLES: Array<{ value: SheetStyle; label: string }> = [
  { value: 'frame', label: 'إطار أسود' },
  { value: 'double', label: 'إطار مزدوج' },
  { value: 'plain', label: 'بدون إطار' },
]
export const SUMMARY_THEMES: Array<{ value: SummaryTheme; label: string }> = [
  { value: 'blue', label: 'أزرق رسمي' },
  { value: 'green', label: 'أخضر ميداني' },
  { value: 'slate', label: 'رمادي فحمي' },
]
export const REPORT_FONTS: Array<{ value: ReportFont; label: string }> = [
  { value: 'cairo', label: 'القاهرة' },
  { value: 'tajawal', label: 'تجوال' },
  { value: 'amiri', label: 'أميري' },
  { value: 'kufi', label: 'كوفي' },
]

export const FONTS: Record<ReportFont, string> = {
  cairo: "'Cairo', system-ui, sans-serif",
  tajawal: "'Tajawal', system-ui, sans-serif",
  amiri: "'Amiri', serif",
  kufi: "'Noto Kufi Arabic', system-ui, sans-serif",
}

export const THEMES: Record<SummaryTheme, Array<{ bg: string; fg: string }>> = {
  blue: [
    { bg: '#1e3a8a', fg: '#ffffff' },
    { bg: '#1d4ed8', fg: '#ffffff' },
    { bg: '#fbbf24', fg: '#0f172a' },
  ],
  green: [
    { bg: '#14532d', fg: '#ffffff' },
    { bg: '#15803d', fg: '#ffffff' },
    { bg: '#fbbf24', fg: '#0f172a' },
  ],
  slate: [
    { bg: '#0f172a', fg: '#ffffff' },
    { bg: '#334155', fg: '#ffffff' },
    { bg: '#f59e0b', fg: '#0f172a' },
  ],
}

export const DEFAULT_STYLE: ReportStyle = {
  photoLayout: 'classic',
  sheetStyle: 'frame',
  summaryTheme: 'blue',
  font: 'cairo',
}
