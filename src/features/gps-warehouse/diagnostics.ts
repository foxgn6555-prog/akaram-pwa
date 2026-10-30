/** 00386-ب — تقرير تشخيص نصي لبطاقة المستودع: يُنسخ ويُلصق في المحادثة لضبط الإعدادات بعد اختبار الأسطول الكامل. بلا أسرار. */
import type { GpsWarehouseLink } from '@sdk/gps-warehouse.sdk'
import type { SpaceOverview } from '@sdk/space.sdk'

const mb = (b: number | null | undefined) => `${((b ?? 0) / 1048576).toFixed(1)} MB`
const t = (v: string | null | undefined) => (v ? new Date(v).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '-')

export function buildWarehouseDiagnostics(link: GpsWarehouseLink | null, space: SpaceOverview | null, now: Date = new Date()): string {
  const L: string[] = [`# GPS warehouse diagnostics ${now.toISOString()}`]
  if (!link) { L.push('link: none'); return L.join('\n') }
  const p = link.ping, pr = p?.progress
  L.push(`host: ${link.warehouse_host ?? '-'} | schema: ${link.schema_version ?? '-'} | last_ping: ${t(link.last_ping_at)} ok=${String(link.last_ping_ok)} | last_error: ${link.last_error_code ?? '-'} @ ${t(link.last_error_at)}`)
  L.push(`registry: ${t(link.last_registry_sync_at)} active=${link.registry_active ?? '-'} | cron: ${link.cron?.scheduled ? 'on' : 'off'} last=${t(link.cron?.last_run_at)} ${link.cron?.last_status ?? ''} | hotspots_cron: ${link.hotspots_cron?.scheduled ? 'on' : 'off'} last_sync=${t(link.last_hotspots_sync_at)} rows=${link.hotspots_rows ?? '-'}`)
  if (p) {
    L.push(`vehicles=${p.vehicles} jobs: queued=${p.jobs.queued} running=${p.jobs.running} done=${p.jobs.done} failed=${p.jobs.failed} | raw_points=${p.raw_points} stops=${p.stops} hotspots=${p.hotspots ?? '-'} | db=${mb(p.db_bytes)}`)
    L.push(`settings: ${JSON.stringify(p.settings)}`)
  }
  if (pr) {
    if (pr.window) L.push(`window: displayed=${pr.window.displayed_month.slice(0, 7)} collecting=${pr.window.collecting_month.slice(0, 7)} cutoff=${pr.window.cutoff} auto_enqueue=${String(pr.window.auto_enqueue)} | paused=${String(pr.paused)} locked=${String(pr.locked)} stale_running=${pr.stale_running ?? 0}`)
    if (pr.throughput) L.push(`throughput: ${pr.throughput.done_last_hour} jobs/h, ${pr.throughput.points_last_hour} pts/h, remaining=${pr.throughput.remaining}, eta_min=${pr.throughput.eta_minutes ?? '-'}`)
    for (const m of pr.months) L.push(`month ${m.month} [${m.role ?? '-'}]: ${m.done}/${m.total} done, queued=${m.queued} running=${m.running} failed=${m.failed}, points=${m.points} stops=${m.stops} devices=${m.devices}, last_hour=${m.done_last_hour}, first=${t(m.first_started_at)} last=${t(m.last_finished_at)}`)
    L.push(`stops_by_class: ${JSON.stringify(pr.stops_by_class)}`)
    for (const e of pr.error_summary ?? []) L.push(`error ${e.error_code}: failed=${e.failed} retrying=${e.retrying} devices=${e.devices} last=${t(e.last_at)}`)
    for (const d of pr.failed_devices ?? []) L.push(`device ${d.device_external_id}: failed_days=${d.failed_days} last=${d.last_error_code ?? '-'} @ ${t(d.last_at)}`)
    for (const e of pr.errors.slice(0, 10)) L.push(`last_error ${e.day} ${e.device_external_id} ${e.error_code} attempts=${e.attempts} @ ${t(e.at)}`)
  }
  if (space) {
    L.push(`space p1: db ${mb(space.db_bytes)}/${mb(space.db_limit_bytes)} (${space.db_pct}%) storage ${mb(space.storage_bytes)}/${mb(space.storage_limit_bytes)} (${space.storage_pct}%)`)
    if (space.warehouse.configured) L.push(`space p2: db ${mb(space.warehouse.db_bytes)}/${mb(space.warehouse.db_limit_bytes)} (${space.warehouse.db_pct}%) storage ${mb(space.warehouse.storage_bytes)}/${mb(space.warehouse.storage_limit_bytes)} (${space.warehouse.storage_pct}%)`)
    for (const a of space.alerts) L.push(`alert ${a.level} ${a.kind}: ${a.message}`)
  }
  return L.join('\n')
}
