/** 00282 — محرك توزيع صفحة الصور (مشترك بين المعاينة/الطباعة/HTML/PDF وملف Word) */
export type PhotoLayout = 'classic' | 'round' | 'polaroid' | 'stack' | 'mosaic' | 'inverse' | 'film' | 'collage' | 'magazine'

/* ===== 00282 — محرك توزيع صفحة الصور: كل قالب يعرّف شكل الصفحة لكل عدد (١–٤) بلا خلايا فارغة ===== */
export type PhotoCount = 1 | 2 | 3 | 4
/** cells[i] = موضع الصورة i (grid-column / grid-row بصيغة CSS) */
export interface PhotoPageSpec { cols: string; rows: string; cells: Array<{ col: string; row: string }> }
const C = (col: string, row: string) => ({ col, row })
const full: PhotoPageSpec = { cols: '1fr', rows: '1fr', cells: [C('1', '1')] }
const twoCols: PhotoPageSpec = { cols: '1fr 1fr', rows: '1fr', cells: [C('1', '1'), C('2', '1')] }
const twoRows: PhotoPageSpec = { cols: '1fr', rows: '1fr 1fr', cells: [C('1', '1'), C('1', '2')] }
/** صفّان: اثنتان فوق + واحدة تغطي الأسفل كاملاً (طلب 00282) */
const twoTopOneWide: PhotoPageSpec = { cols: '1fr 1fr', rows: '1fr 1fr', cells: [C('1', '1'), C('2', '1'), C('1 / -1', '2')] }
const grid2x2: PhotoPageSpec = { cols: '1fr 1fr', rows: '1fr 1fr', cells: [C('1', '1'), C('2', '1'), C('1', '2'), C('2', '2')] }
const SPECS: Record<PhotoLayout, Record<PhotoCount, PhotoPageSpec>> = {
  classic: { 1: full, 2: twoCols, 3: twoTopOneWide, 4: grid2x2 },
  round: { 1: full, 2: twoCols, 3: twoTopOneWide, 4: grid2x2 },
  polaroid: { 1: full, 2: twoCols, 3: twoTopOneWide, 4: grid2x2 },
  stack: {
    1: full, 2: twoRows,
    3: { cols: '1fr', rows: '1fr 1fr 1fr', cells: [C('1', '1'), C('1', '2'), C('1', '3')] },
    4: { cols: '1fr', rows: '1fr 1fr 1fr 1fr', cells: [C('1', '1'), C('1', '2'), C('1', '3'), C('1', '4')] },
  },
  film: {
    1: full, 2: twoCols,
    3: { cols: '1fr 1fr 1fr', rows: '1fr', cells: [C('1', '1'), C('2', '1'), C('3', '1')] },
    4: { cols: '1fr 1fr 1fr 1fr', rows: '1fr', cells: [C('1', '1'), C('2', '1'), C('3', '1'), C('4', '1')] },
  },
  mosaic: {
    1: full,
    2: { cols: '1fr', rows: '3fr 2fr', cells: [C('1', '1'), C('1', '2')] },
    3: { cols: '1fr 1fr', rows: '3fr 2fr', cells: [C('1 / -1', '1'), C('1', '2'), C('2', '2')] },
    4: { cols: '1fr 1fr 1fr', rows: '3fr 2fr', cells: [C('1 / -1', '1'), C('1', '2'), C('2', '2'), C('3', '2')] },
  },
  inverse: {
    1: full,
    2: { cols: '1fr', rows: '2fr 3fr', cells: [C('1', '1'), C('1', '2')] },
    3: { cols: '1fr 1fr', rows: '2fr 3fr', cells: [C('1', '1'), C('2', '1'), C('1 / -1', '2')] },
    4: { cols: '1fr 1fr 1fr', rows: '2fr 3fr', cells: [C('1', '1'), C('2', '1'), C('3', '1'), C('1 / -1', '2')] },
  },
  collage: {
    1: full, 2: { cols: '3fr 2fr', rows: '1fr', cells: [C('1', '1'), C('2', '1')] },
    3: { cols: '3fr 2fr', rows: '1fr 1fr', cells: [C('1', '1 / -1'), C('2', '1'), C('2', '2')] },
    4: { cols: '3fr 2fr', rows: '1fr 1fr 1fr', cells: [C('1', '1 / -1'), C('2', '1'), C('2', '2'), C('2', '3')] },
  },
  magazine: {
    1: full, 2: twoCols,
    3: { cols: '1fr 1fr', rows: '1fr 1fr', cells: [C('1', '1 / -1'), C('2', '1'), C('2', '2')] },
    4: { cols: '1fr 1fr', rows: '1fr 1fr 1fr', cells: [C('1', '1 / 3'), C('2', '1'), C('2', '2'), C('1 / -1', '3')] },
  },
}
export const PHOTOS_PER_PAGE = 4
export function photoPageSpec(layout: PhotoLayout, count: number): PhotoPageSpec {
  const n = Math.min(PHOTOS_PER_PAGE, Math.max(1, Math.trunc(count))) as PhotoCount
  return (SPECS[layout] ?? SPECS.classic)[n]
}
/** للتحقق: كل خلية داخل الشبكة، لا تداخل، لا فراغ — تُستخدم في الاختبارات ومحاكاة Word */
export function photoPageCoverage(spec: PhotoPageSpec): { cols: number; rows: number; occupied: number[][]; complete: boolean; overlap: boolean } {
  const cols = spec.cols.trim().split(/\s+/).length, rows = spec.rows.trim().split(/\s+/).length
  const span = (v: string, max: number): [number, number] => {
    const [a, b] = v.split('/').map((x) => x.trim())
    const start = Number(a)
    const end = b === undefined ? start + 1 : b === '-1' ? max + 1 : Number(b)
    return [start, end]
  }
  const occ = Array.from({ length: rows }, () => Array<number>(cols).fill(0))
  let overlap = false
  spec.cells.forEach((c, i) => {
    const [c0, c1] = span(c.col, cols), [r0, r1] = span(c.row, rows)
    for (let r = r0; r < r1; r++) for (let k = c0; k < c1; k++) { if (occ[r - 1]![k - 1]) overlap = true; occ[r - 1]![k - 1] = i + 1 }
  })
  return { cols, rows, occupied: occ, complete: occ.every((r) => r.every(Boolean)), overlap }
}
