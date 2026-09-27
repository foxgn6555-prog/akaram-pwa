/** حساب الفترات الجاهزة (يومي/أسبوعي/شهري/ربعي/نصف سنوي/سنوي) + الفترة السابقة المكافئة للمقارنة */
import type { PeriodPreset } from '../types'

export const PERIOD_PRESETS: Array<{ key: PeriodPreset; label: string }> = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week', label: 'آخر 7 أيام' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'prev_month', label: 'الشهر الماضي' },
  { key: 'quarter', label: 'هذا الربع' },
  { key: 'half', label: 'نصف السنة' },
  { key: 'year', label: 'هذه السنة' },
  { key: 'custom', label: 'مخصص' },
]

export function iso(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
export function parseIso(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1) }
export function addDays(s: string, n: number): string { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d) }

export function presetRange(preset: PeriodPreset, today = new Date()): { from: string; to: string } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const y = t.getFullYear(), m = t.getMonth()
  switch (preset) {
    case 'today': return { from: iso(t), to: iso(t) }
    case 'yesterday': { const d = new Date(t); d.setDate(d.getDate() - 1); return { from: iso(d), to: iso(d) } }
    case 'week': { const d = new Date(t); d.setDate(d.getDate() - 6); return { from: iso(d), to: iso(t) } }
    case 'month': return { from: iso(new Date(y, m, 1)), to: iso(t) }
    case 'prev_month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'quarter': { const qs = Math.floor(m / 3) * 3; return { from: iso(new Date(y, qs, 1)), to: iso(t) } }
    case 'half': { const hs = m < 6 ? 0 : 6; return { from: iso(new Date(y, hs, 1)), to: iso(t) } }
    case 'year': return { from: iso(new Date(y, 0, 1)), to: iso(t) }
    default: return { from: iso(new Date(y, m, 1)), to: iso(t) }
  }
}

/** الفترة السابقة المكافئة بنفس الطول (للمقارنة) */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const days = Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000) + 1
  return { from: addDays(from, -days), to: addDays(from, -1) }
}

export function periodLabel(from: string, to: string): string {
  if (from === to) return `يوم ${from}`
  return `من ${from} إلى ${to}`
}

/** نوع التقرير الجاهز حسب طول الفترة */
export function reportKindLabel(from: string, to: string): string {
  const days = Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000) + 1
  if (days <= 1) return 'تقرير يومي'
  if (days <= 7) return 'تقرير أسبوعي'
  if (days <= 31) return 'تقرير شهري'
  if (days <= 95) return 'تقرير ربع سنوي'
  if (days <= 190) return 'تقرير نصف سنوي'
  return 'تقرير سنوي'
}
