/**
 * 00362 — إعدادات بقع التوقف (غرفة العمليات / IT): تشغيل المحرك، الحد الأقصى بالأيام، عتبات التوقف،
 * نصف قطر التجميع، والأماكن المستبعدة (زونات + معالم) — تُطبَّق فوراً ويُعاد الحساب.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GpsStopHotspotSettings, GpsStopHotspotSettingsPatch } from '@sdk/gps-lvn.sdk'
import { useGpsMapGeofences, useGpsMapLandmarks, useSaveGpsStopHotspotSettings } from '@features/gps-lvn/hooks'

const Num = ({ label, hint, value, min, max, onChange, testId }: { label: string; hint?: string; value: number; min: number; max: number; onChange: (v: number) => void; testId?: string }) => (
  <label className="block text-[11px]">
    <span className="font-black text-slate-700">{label}</span>
    <input
      type="number"
      dir="ltr"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mt-0.5 w-full rounded-lg border px-2 py-1 text-sm"
      data-testid={testId}
    />
    {hint && <span className="text-[9px] text-slate-500">{hint}</span>}
  </label>
)

export default function StopHotspotSettingsDialog({ settings, onClose }: { settings: GpsStopHotspotSettings; onClose: () => void }) {
  const zones = useGpsMapGeofences()
  const landmarks = useGpsMapLandmarks()
  const save = useSaveGpsStopHotspotSettings()
  const [form, setForm] = useState({
    enabled: settings.enabled,
    max_days: settings.max_days,
    stop_min_minutes: Math.round(settings.stop_min_seconds / 60),
    stop_speed_kmh: Number(settings.stop_speed_kmh),
    cluster_radius_m: settings.cluster_radius_m,
    landmark_exclude_radius_m: settings.landmark_exclude_radius_m,
    excluded_zone_ids: settings.excluded_zone_ids,
    excluded_landmark_ids: settings.excluded_landmark_ids,
  })
  const [zoneSearch, setZoneSearch] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const zoneList = useMemo(() => {
    const q = zoneSearch.trim()
    return (zones.data ?? []).filter((z) => !q || z.name.includes(q))
  }, [zones.data, zoneSearch])
  const toggle = (key: 'excluded_zone_ids' | 'excluded_landmark_ids', id: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }))
  const invalid =
    form.max_days < 1 || form.max_days > 30 || form.stop_min_minutes < 1 || form.stop_min_minutes > 120 ||
    form.cluster_radius_m < 20 || form.cluster_radius_m > 500 || form.stop_speed_kmh < 0 || form.stop_speed_kmh > 30 ||
    form.landmark_exclude_radius_m < 20 || form.landmark_exclude_radius_m > 2000
  const submit = () => {
    const patch: GpsStopHotspotSettingsPatch = {
      enabled: form.enabled,
      max_days: form.max_days,
      stop_min_seconds: form.stop_min_minutes * 60,
      stop_speed_kmh: form.stop_speed_kmh,
      cluster_radius_m: form.cluster_radius_m,
      landmark_exclude_radius_m: form.landmark_exclude_radius_m,
      excluded_zone_ids: form.excluded_zone_ids,
      excluded_landmark_ids: form.excluded_landmark_ids,
    }
    save.mutate(patch, { onSuccess: onClose })
  }
  return createPortal(
    <div className="fixed inset-0 z-[3000] grid place-items-center bg-slate-950/50 p-3" role="dialog" aria-modal="true" aria-label="إعدادات بقع التوقف" data-testid="hotspot-settings-dialog" dir="rtl">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black">⚙ إعدادات بقع التوقف</h3>
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black">✕</button>
        </div>
        <p className="mt-1 text-[11px] text-slate-600">
          تُحسب البقع من توقفات الآليات المربوطة بأجهزة GPS طوال اليوم (داخل الانطلاقات وخارجها)، وتُحذف التوقفات الأقدم من الحد الأقصى تلقائياً.
          الأماكن المستبعدة (الكراج، المحطة…) لا تظهر كبقع.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm font-black">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} data-testid="hotspot-enabled" />
          تشغيل محرك بقع التوقف
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="الحد الأقصى للاحتفاظ (أيام)" hint="1–30 · النافذة على الخريطة لا تتجاوزه" value={form.max_days} min={1} max={30} onChange={(v) => setForm((f) => ({ ...f, max_days: v }))} testId="hotspot-max-days" />
          <Num label="أقل مدة تُعدّ توقفاً (دقائق)" hint="1–120" value={form.stop_min_minutes} min={1} max={120} onChange={(v) => setForm((f) => ({ ...f, stop_min_minutes: v }))} testId="hotspot-min-minutes" />
          <Num label="سرعة التوقف القصوى (كم/س)" hint="0–30 · ما دونها يُعدّ توقفاً" value={form.stop_speed_kmh} min={0} max={30} onChange={(v) => setForm((f) => ({ ...f, stop_speed_kmh: v }))} />
          <Num label="نصف قطر تجميع البقعة (م)" hint="20–500" value={form.cluster_radius_m} min={20} max={500} onChange={(v) => setForm((f) => ({ ...f, cluster_radius_m: v }))} />
          <Num label="نصف قطر استبعاد المعلم (م)" hint="20–2000" value={form.landmark_exclude_radius_m} min={20} max={2000} onChange={(v) => setForm((f) => ({ ...f, landmark_exclude_radius_m: v }))} />
          <div className="text-[10px] text-slate-500">
            أحداث مخزّنة: <b>{settings.events_count.toLocaleString('en-US')}</b>
            <br />
            آخر حساب: {settings.last_refresh_at ? new Date(settings.last_refresh_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', hour12: false }) : '—'}
            {settings.last_refresh_ms !== null ? ` (${settings.last_refresh_ms} مللي ث)` : ''}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border p-2">
            <div className="flex items-center justify-between">
              <b className="text-xs">زونات مستبعدة ({form.excluded_zone_ids.length})</b>
              <input value={zoneSearch} onChange={(e) => setZoneSearch(e.target.value)} placeholder="بحث…" className="w-24 rounded-lg border px-2 py-0.5 text-[10px]" />
            </div>
            <div className="mt-1 max-h-48 space-y-0.5 overflow-auto text-[11px]" data-testid="hotspot-zones">
              {zones.isLoading && <div className="text-slate-500">… تحميل الزونات</div>}
              {zoneList.map((z) => (
                <label key={z.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50">
                  <input type="checkbox" checked={form.excluded_zone_ids.includes(z.id)} onChange={() => toggle('excluded_zone_ids', z.id)} />
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: z.color || '#7c3aed' }} />
                  <span className="truncate">{z.name}</span>
                </label>
              ))}
              {!zones.isLoading && zoneList.length === 0 && <div className="text-slate-500">لا زونات</div>}
            </div>
          </section>
          <section className="rounded-xl border p-2">
            <b className="text-xs">معالم مستبعدة ({form.excluded_landmark_ids.length})</b>
            <div className="mt-1 max-h-48 space-y-0.5 overflow-auto text-[11px]" data-testid="hotspot-landmarks">
              {landmarks.isLoading && <div className="text-slate-500">… تحميل المعالم</div>}
              {(landmarks.data ?? []).map((l) => (
                <label key={l.id} className="flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-slate-50">
                  <input type="checkbox" checked={form.excluded_landmark_ids.includes(l.id)} onChange={() => toggle('excluded_landmark_ids', l.id)} />
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                  <span className="truncate">{l.name}</span>
                </label>
              ))}
              {!landmarks.isLoading && (landmarks.data ?? []).length === 0 && <div className="text-slate-500">لا معالم — أضف معلماً (كراج/محطة) من صفحة GPS ثم استبعده هنا</div>}
            </div>
          </section>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black">إلغاء</button>
          <button type="button" disabled={invalid || save.isPending} onClick={submit} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50" data-testid="hotspot-settings-save">
            {save.isPending ? '… حفظ وإعادة الحساب' : 'حفظ وإعادة الحساب'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
