import type { UnmatchedPersonRow, UnmatchedUnitPerson } from '../types'
/** يحافظ على شكل التقرير الأول مع استخدام حالات المحرك المشترك. */
export function summaryRows(rows: UnmatchedUnitPerson[], branches: Array<{ id: string; name: string }>): UnmatchedPersonRow[] {
  return rows.map(r => {
    const days = r.days.map(d => {
      const minutes = d.status === 'present' && d.entry && d.exit
        ? Math.max(0, Math.floor((Date.parse(`${d.exit}Z`) - Date.parse(`${d.entry}Z`)) / 60_000)) : 0
      return { d: d.date, status: d.status, n: d.punch_count, minutes: Number.isFinite(minutes) ? minutes : 0,
        first: (d.entry || d.raw_first)?.slice(11, 16) ?? null, last: (d.exit || d.raw_last)?.slice(11, 16) ?? null }
    })
    return { pin: r.pin, person_name: r.person_name, device_serial: r.device_serial, device_name: r.device_name || '—', branch_id: r.branch_id,
      branch_name: branches.find(b => b.id === r.branch_id)?.name ?? null, days,
      present_days: days.filter(d => d.status === 'present').length, missing_days: days.filter(d => d.status === 'missing').length,
      absent_days: days.filter(d => d.status === 'absent').length, total_minutes: days.reduce((sum, d) => sum + d.minutes, 0), first_seen: '', last_seen: '' }
  })
}
