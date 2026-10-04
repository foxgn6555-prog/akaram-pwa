/** تجميع البصمات غير المطابقة إلى صفوف يوم × PIN — منطق خالص قابل للاختبار */
import type { BiometricPunch } from '@features/integrations'

export interface UnmatchedDay {
  key: string
  pin: string
  day: string
  deviceName: string | null
  deviceSerial: string
  firstAt: string
  lastAt: string
  count: number
}

/** تجميع البصمات غير المطابقة إلى صفوف يوم × PIN (الوقت المحلي للمتصفح = توقيت الشركة) */
export function groupUnmatchedPunches(punches: BiometricPunch[]): UnmatchedDay[] {
  const map = new Map<string, UnmatchedDay>()
  for (const p of punches) {
    if (p.employee_id) continue
    const d = new Date(p.punched_at)
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const key = `${p.pin}|${day}`
    const row = map.get(key)
    if (!row) {
      map.set(key, { key, pin: p.pin, day, deviceName: p.device_user_name ?? p.person_name ?? null, deviceSerial: p.device_serial, firstAt: p.punched_at, lastAt: p.punched_at, count: 1 })
    } else {
      row.count += 1
      if (p.punched_at < row.firstAt) row.firstAt = p.punched_at
      if (p.punched_at > row.lastAt) row.lastAt = p.punched_at
      if (!row.deviceName && (p.device_user_name || p.person_name)) row.deviceName = p.device_user_name ?? p.person_name ?? null
    }
  }
  return [...map.values()].sort((a, b) => (a.day === b.day ? a.pin.localeCompare(b.pin, undefined, { numeric: true }) : b.day.localeCompare(a.day)))
}
