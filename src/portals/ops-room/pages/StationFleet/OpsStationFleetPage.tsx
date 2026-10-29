/**
 * غرفة العمليات — أسطول المحطة التحويلية (00329)
 * ① آليات المحطة: بحث في قاعدة آليات الكراج وتعليم «آلية محطة» (المحطة تراها للقراءة فقط).
 * ② الوجهات: النهروان/النباعي… + ربط كل وجهة بزون GPS من زونات المنصة (الوصول يُسجَّل آلياً عند الدخول).
 * ③ السائقون الخارجيون: سجل سائقي المتعهدين (اسم/هاتف/متعهد/إجازة/نشط).
 * ④ الفئات الموحّدة: قائمة واحدة للمنصة (حدود الوزن، فئة خروج من المحطة، تُستخدم في الكراج).
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { Check, MapPin, Plus, Save, Search, Truck, UserPlus, X } from 'lucide-react'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { useGpsMapGeofences } from '@features/gps-lvn/hooks'
import {
  useContractorOptions, useSaveExternalDriver, useSaveStationDestination, useSaveVehicleCategory, useSetStationVehicle,
  useStationDestinations, useStationExternalDrivers, useStationFleetCandidates, useVehicleCategories,
} from '@features/station-fleet/hooks'
import type { StationExternalDriver, VehicleCategory, WeighingDestination } from '@sdk/station-fleet.sdk'

type Tab = 'vehicles' | 'destinations' | 'drivers' | 'categories'
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'vehicles', label: 'آليات المحطة' },
  { id: 'destinations', label: 'الوجهات والزونات' },
  { id: 'drivers', label: 'السائقون الخارجيون' },
  { id: 'categories', label: 'فئات الآليات' },
]
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none'
const btnDark = 'inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50'
const btnLight = 'inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700'

export default function OpsStationFleetPage() {
  const [tab, setTab] = useState<Tab>('vehicles')
  const destinations = useStationDestinations(true)
  const drivers = useStationExternalDrivers()
  const stationVehicles = useStationFleetCandidates('', true)
  return (
    <section dir="rtl" className="space-y-4" data-testid="ops-station-fleet-page">
      <ExecPageHeader icon="truck" title="أسطول المحطة التحويلية"
        subtitle="آليات المحطة (نسافات، سكسات، ناقلات حاويات مكبسية) ووجهاتها وسائقوها تُدار هنا فقط؛ المحطة تختار من هذه القوائم ولا تكتب أسماء يدوياً. الوصول إلى الوجهة يُسجَّل آلياً عند دخول زونها."
        stats={[
          { label: 'آليات المحطة', value: stationVehicles.data?.length ?? 0, tone: 'plain', testId: 'sf-st-vehicles' },
          { label: 'وجهات فعّالة', value: destinations.data?.filter((d) => d.active).length ?? 0, tone: 'plain', testId: 'sf-st-dest' },
          { label: 'بلا زون', value: destinations.data?.filter((d) => d.active && !d.has_zone).length ?? 0, tone: 'red', testId: 'sf-st-nozone' },
          { label: 'سائقون خارجيون', value: drivers.data?.filter((d) => d.active).length ?? 0, tone: 'plain', testId: 'sf-st-drivers' },
        ]} />
      <nav className="flex flex-wrap gap-2" aria-label="أقسام أسطول المحطة">
        {TABS.map((t) => (
          <button key={t.id} type="button" data-testid={`sf-tab-${t.id}`} onClick={() => setTab(t.id)}
            className={`rounded-xl px-3 py-2 text-xs font-black ${tab === t.id ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'vehicles' && <VehiclesPanel />}
      {tab === 'destinations' && <DestinationsPanel />}
      {tab === 'drivers' && <DriversPanel />}
      {tab === 'categories' && <CategoriesPanel />}
    </section>
  )
}

/* ───────── ① آليات المحطة ───────── */
function VehiclesPanel() {
  const [q, setQ] = useState('')
  const [onlyStation, setOnlyStation] = useState(false)
  const list = useStationFleetCandidates(q.trim(), onlyStation)
  const toggle = useSetStationVehicle()
  return (
    <section className="rounded-3xl border bg-white p-4 shadow-sm md:p-5" data-testid="sf-vehicles-panel">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1 text-[11px] font-bold text-slate-600">بحث (رقم DB، اللوحة، الاسم، الفئة)
          <div className="relative mt-1"><Search size={14} className="absolute right-3 top-3 text-slate-400" />
            <input className={`${input} pr-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثال: نسافة" data-testid="sf-veh-search" /></div>
        </label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
          <input type="checkbox" checked={onlyStation} onChange={(e) => setOnlyStation(e.target.checked)} data-testid="sf-veh-only" /> آليات المحطة فقط
        </label>
        <Link to="/ops-room/vehicles-database" className={btnLight}><Truck size={14} /> قاعدة بيانات الآليات (إضافة/تعديل)</Link>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-slate-500">الإضافة والتعديل على بيانات الآلية من قاعدة بيانات الآليات. هنا فقط تُعلَّم الآلية كـ«آلية محطة» لتظهر للمحطة التحويلية. فئات الخروج المسموح بها للمحطة: نسافة، سكس، ناقلة حاويات مكبسية (تُضبط من تبويب الفئات).</p>
      {list.isLoading ? <LoadingSpinner /> : !list.data?.length ? <EmptyState title="لا آليات مطابقة" /> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs" data-testid="sf-veh-table">
            <thead><tr className="bg-slate-50 text-[11px] text-slate-500">
              <th className="p-2 text-right">DB</th><th className="p-2 text-right">الآلية</th><th className="p-2 text-right">الفئة</th><th className="p-2 text-right">السائق الحالي</th><th className="p-2 text-right">القاطع</th><th className="p-2 text-center">GPS</th><th className="p-2 text-center">آلية محطة</th>
            </tr></thead>
            <tbody>
              {list.data.map((v) => (
                <tr key={v.id} className="border-t" data-testid={`sf-veh-${v.db_number}`}>
                  <td className="p-2 font-black tabular-nums" dir="ltr">{v.db_number}</td>
                  <td className="p-2">{v.vehicle_name}<span className="block text-[10px] text-slate-400" dir="ltr">{v.plate_number}</span></td>
                  <td className="p-2">{v.category_label}{v.station_outbound && <span className="mr-1 rounded bg-emerald-50 px-1 text-[10px] font-bold text-emerald-700">خروج</span>}</td>
                  <td className="p-2">{v.driver_name ?? '—'}</td>
                  <td className="p-2">{v.sector_name ?? '—'}</td>
                  <td className="p-2 text-center">{v.has_gps ? <span className="text-emerald-600 font-bold">مرتبط</span> : <span className="text-amber-600 font-bold">لا</span>}</td>
                  <td className="p-2 text-center">
                    <button type="button" data-testid={`sf-veh-toggle-${v.db_number}`} disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ vehicleId: v.id, isStation: !v.is_station_vehicle })}
                      className={`rounded-xl px-3 py-1 text-[11px] font-black ${v.is_station_vehicle ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-600'}`}>
                      {v.is_station_vehicle ? 'نعم — إلغاء' : 'تعليم'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ───────── ② الوجهات ───────── */
type DestDraft = { id: string | null; name: string; geofenceId: string; sort: string; active: boolean }
function DestinationsPanel() {
  const list = useStationDestinations(true)
  const zones = useGpsMapGeofences()
  const save = useSaveStationDestination()
  const [draft, setDraft] = useState<DestDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const platformZones = (zones.data ?? []).filter((z) => z.source === 'platform')
  const submit = () => {
    if (!draft) return
    if (draft.name.trim().length < 2) return setError('اسم الوجهة مطلوب')
    setError(null)
    save.mutate({ id: draft.id, name: draft.name.trim(), geofenceId: draft.geofenceId || null, sort: Number(draft.sort) || 0, active: draft.active }, { onSuccess: () => setDraft(null) })
  }
  return (
    <section className="rounded-3xl border bg-white p-4 shadow-sm md:p-5" data-testid="sf-destinations-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="flex items-center gap-2 text-sm text-slate-900"><MapPin size={16} className="text-sky-600" /> وجهات الخروج وزوناتها</b>
        <div className="flex gap-2">
          <Link to="/ops-room/gps" className={btnLight}>رسم زون جديد في صفحة GPS</Link>
          <button type="button" className={btnDark} data-testid="sf-dest-add" onClick={() => { setError(null); setDraft({ id: null, name: '', geofenceId: '', sort: '10', active: true }) }}><Plus size={14} /> وجهة جديدة</button>
        </div>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">ارسم زون الوجهة (مثلاً حول موقع طمر النهروان) من صفحة GPS ثم اربطه هنا. بلا زون: الوصول يبقى «غير معروف» حتى لو كان للآلية GPS.</p>
      {draft && (
        <div className="mt-3 grid gap-2 rounded-2xl border border-sky-100 bg-sky-50/50 p-3 md:grid-cols-5" data-testid="sf-dest-form">
          <label className="text-[11px] font-bold text-slate-600 md:col-span-2">اسم الوجهة<input className={input} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="sf-dest-name" /></label>
          <label className="text-[11px] font-bold text-slate-600 md:col-span-2">زون GPS
            <select className={input} value={draft.geofenceId} onChange={(e) => setDraft({ ...draft, geofenceId: e.target.value })} data-testid="sf-dest-zone">
              <option value="">— بلا زون —</option>
              {platformZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select></label>
          <label className="text-[11px] font-bold text-slate-600">الترتيب<input className={input} inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} data-testid="sf-dest-active" /> فعّالة</label>
          {error && <p className="text-xs font-bold text-rose-600 md:col-span-5" role="alert">{error}</p>}
          <div className="flex gap-2 md:col-span-5">
            <button type="button" className={btnDark} onClick={submit} disabled={save.isPending} data-testid="sf-dest-save"><Save size={14} /> حفظ</button>
            <button type="button" className={btnLight} onClick={() => setDraft(null)}><X size={14} /> إلغاء</button>
          </div>
        </div>
      )}
      {list.isLoading ? <LoadingSpinner /> : (
        <ul className="mt-3 divide-y" data-testid="sf-dest-list">
          {(list.data ?? []).map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`sf-dest-${d.name}`}>
              <div>
                <b className={`text-sm ${d.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>{d.name}</b>
                <span className={`mr-2 rounded px-2 py-0.5 text-[10px] font-bold ${d.has_zone ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{d.has_zone ? `زون: ${d.geofence_name}` : 'بلا زون — الوصول لن يُسجَّل'}</span>
              </div>
              <button type="button" className={btnLight} data-testid={`sf-dest-edit-${d.name}`}
                onClick={() => { setError(null); setDraft({ id: d.id, name: d.name, geofenceId: d.geofence_id ?? '', sort: String(d.sort), active: d.active }) }}>تعديل</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ───────── ③ السائقون الخارجيون ───────── */
type DrvDraft = { id: string | null; fullName: string; contractorUserId: string; phone: string; licenseNo: string; notes: string; active: boolean }
const toDrvDraft = (d?: StationExternalDriver): DrvDraft => d
  ? { id: d.id, fullName: d.full_name, contractorUserId: d.contractor_user_id ?? '', phone: d.phone ?? '', licenseNo: d.license_no ?? '', notes: d.notes ?? '', active: d.active }
  : { id: null, fullName: '', contractorUserId: '', phone: '', licenseNo: '', notes: '', active: true }
function DriversPanel() {
  const list = useStationExternalDrivers()
  const contractors = useContractorOptions()
  const save = useSaveExternalDriver()
  const [draft, setDraft] = useState<DrvDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    if (!draft) return
    if (draft.fullName.trim().length < 2) return setError('اسم السائق مطلوب')
    if (!draft.contractorUserId) return setError('اختر المتعهد من حسابات المتعهدين في النظام')
    if (draft.phone.trim() && !/^[0-9+]{7,20}$/.test(draft.phone.trim())) return setError('رقم الهاتف: أرقام فقط (7–20)')
    setError(null)
    save.mutate({ id: draft.id, fullName: draft.fullName.trim(), contractorUserId: draft.contractorUserId, phone: draft.phone.trim() || null, licenseNo: draft.licenseNo.trim() || null, licenseImagePath: null, notes: draft.notes.trim() || null, active: draft.active },
      { onSuccess: () => setDraft(null) })
  }
  return (
    <section className="rounded-3xl border bg-white p-4 shadow-sm md:p-5" data-testid="sf-drivers-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="flex items-center gap-2 text-sm text-slate-900"><UserPlus size={16} className="text-emerald-600" /> سائقو المتعهدين الخارجيون</b>
        <button type="button" className={btnDark} data-testid="sf-drv-add" onClick={() => { setError(null); setDraft(toDrvDraft()) }}><Plus size={14} /> سائق خارجي</button>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">سائقو الشركة موظفون في HR (مسمّى سائق) ويظهرون للمحطة تلقائياً. هنا فقط سائقو المتعهدين، وكل سائق يُربط بحساب متعهد موجود في النظام (بوابة المتعهدين — تُنشئه IT). الموقوف لا يظهر للمحطة.</p>
      {draft && (
        <div className="mt-3 grid gap-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 md:grid-cols-4" data-testid="sf-drv-form">
          <label className="text-[11px] font-bold text-slate-600">الاسم الكامل<input className={input} value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} data-testid="sf-drv-name" /></label>
          <label className="text-[11px] font-bold text-slate-600">المتعهد (حساب في النظام)
            <select className={input} value={draft.contractorUserId} onChange={(e) => setDraft({ ...draft, contractorUserId: e.target.value })} data-testid="sf-drv-contractor">
              <option value="">— اختر المتعهد —</option>
              {(contractors.data ?? []).map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name}{c.area_name ? ` · ${c.area_name}` : ''}</option>)}
            </select>
            {contractors.data && contractors.data.length === 0 && <span className="mt-1 block text-[10px] font-bold text-amber-700">لا حسابات متعهدين نشطة — تُنشأ من بوابة تقنية المعلومات.</span>}
          </label>
          <label className="text-[11px] font-bold text-slate-600">الهاتف<input className={input} dir="ltr" inputMode="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} data-testid="sf-drv-phone" /></label>
          <label className="text-[11px] font-bold text-slate-600">رقم إجازة السوق<input className={input} dir="ltr" value={draft.licenseNo} onChange={(e) => setDraft({ ...draft, licenseNo: e.target.value })} /></label>
          <label className="text-[11px] font-bold text-slate-600 md:col-span-3">ملاحظات<input className={input} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} data-testid="sf-drv-active" /> نشط</label>
          {error && <p className="text-xs font-bold text-rose-600 md:col-span-4" role="alert">{error}</p>}
          <div className="flex gap-2 md:col-span-4">
            <button type="button" className={btnDark} onClick={submit} disabled={save.isPending} data-testid="sf-drv-save"><Save size={14} /> حفظ</button>
            <button type="button" className={btnLight} onClick={() => setDraft(null)}><X size={14} /> إلغاء</button>
          </div>
        </div>
      )}
      {list.isLoading ? <LoadingSpinner /> : !list.data?.length ? <EmptyState title="لا سائقين خارجيين بعد" /> : (
        <table className="mt-3 w-full text-xs" data-testid="sf-drv-table">
          <thead><tr className="bg-slate-50 text-[11px] text-slate-500"><th className="p-2 text-right">الاسم</th><th className="p-2 text-right">المتعهد</th><th className="p-2 text-right">الهاتف</th><th className="p-2 text-right">الإجازة</th><th className="p-2 text-center">الحالة</th><th className="p-2" /></tr></thead>
          <tbody>
            {list.data.map((d) => (
              <tr key={d.id} className="border-t" data-testid={`sf-drv-${d.full_name}`}>
                <td className="p-2 font-bold">{d.full_name}{d.vehicles?.length ? <span className="mr-1 text-[10px] font-bold text-slate-500">· {d.vehicles.map((x) => `DB ${x}`).join('، ')}</span> : null}</td>
                <td className="p-2">{d.contractor_name}{!d.contractor_user_id && <span className="mr-1 rounded bg-amber-50 px-1 text-[10px] font-bold text-amber-800" title="سجل قديم بلا حساب — عدّله واختر الحساب">غير مرتبط</span>}</td>
                <td className="p-2 tabular-nums" dir="ltr">{d.phone ?? '—'}</td><td className="p-2" dir="ltr">{d.license_no ?? '—'}</td>
                <td className="p-2 text-center">{d.active ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">نشط</span> : <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">موقوف</span>}</td>
                <td className="p-2 text-left"><button type="button" className={btnLight} onClick={() => { setError(null); setDraft(toDrvDraft(d)) }} data-testid={`sf-drv-edit-${d.full_name}`}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

/* ───────── ④ الفئات الموحّدة ───────── */
const WEIGH_AR: Record<WeighingDestination, string> = { press: 'المكبس', transfer_station: 'المحطة التحويلية', both: 'المكبس والمحطة' }
type CatDraft = { code: string; isNew: boolean; label: string; minTons: string; maxTons: string; weighing: '' | WeighingDestination; garageUsable: boolean; stationOutbound: boolean; sort: string; active: boolean }
const toCatDraft = (c?: VehicleCategory): CatDraft => c
  ? { code: c.code, isNew: false, label: c.label, minTons: c.min_tons === null ? '' : String(c.min_tons), maxTons: c.max_tons === null ? '' : String(c.max_tons), weighing: c.weighing_destination ?? '', garageUsable: c.garage_usable, stationOutbound: c.station_outbound, sort: String(c.sort), active: c.active }
  : { code: '', isNew: true, label: '', minTons: '', maxTons: '', weighing: '', garageUsable: true, stationOutbound: false, sort: '50', active: true }
function CategoriesPanel() {
  const list = useVehicleCategories(true)
  const save = useSaveVehicleCategory()
  const [draft, setDraft] = useState<CatDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = () => {
    if (!draft) return
    const min = draft.minTons.trim() === '' ? null : Number(draft.minTons)
    const max = draft.maxTons.trim() === '' ? null : Number(draft.maxTons)
    if (!/^[a-z0-9_]{2,40}$/.test(draft.code)) return setError('رمز الفئة: أحرف لاتينية صغيرة وأرقام و_ فقط (2–40)')
    if (draft.label.trim().length < 2) return setError('اسم الفئة مطلوب')
    if (draft.weighing && min === null) return setError('فئات الوزن تحتاج حداً أدنى بالطن')
    if (min !== null && (!Number.isFinite(min) || min <= 0 || min >= 100)) return setError('الحد الأدنى بين 0.1 و99.9 طن')
    if (max !== null && (min === null || !Number.isFinite(max) || max < min || max >= 100)) return setError('الحد الأعلى ≥ الحد الأدنى وأقل من 100')
    setError(null)
    save.mutate({ code: draft.code, label: draft.label.trim(), minTons: min, maxTons: max, weighingDestination: draft.weighing || null, garageUsable: draft.garageUsable, stationOutbound: draft.stationOutbound, sort: Number(draft.sort) || 0, active: draft.active },
      { onSuccess: () => setDraft(null) })
  }
  return (
    <section className="rounded-3xl border bg-white p-4 shadow-sm md:p-5" data-testid="sf-categories-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-sm text-slate-900">فئات الآليات الموحّدة</b>
        <button type="button" className={btnDark} data-testid="sf-cat-add" onClick={() => { setError(null); setDraft(toCatDraft()) }}><Plus size={14} /> فئة جديدة</button>
      </div>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">قائمة واحدة لكل المنصة: الكراج يختار منها، والمحطة تستخدم حدود الوزن (الأقل من الحد الأدنى = مخالفة) وفئات الخروج. إيقاف فئة يمنع اختيارها للآليات الجديدة ولا يمس الآليات الحالية.</p>
      {draft && (
        <div className="mt-3 grid gap-2 rounded-2xl border border-orange-100 bg-orange-50/40 p-3 md:grid-cols-4" data-testid="sf-cat-form">
          <label className="text-[11px] font-bold text-slate-600">الرمز (لاتيني)<input className={input} dir="ltr" value={draft.code} disabled={!draft.isNew} onChange={(e) => setDraft({ ...draft, code: e.target.value })} data-testid="sf-cat-code" /></label>
          <label className="text-[11px] font-bold text-slate-600">الاسم<input className={input} value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} data-testid="sf-cat-label" /></label>
          <label className="text-[11px] font-bold text-slate-600">الحد الأدنى (طن)<input className={input} inputMode="decimal" dir="ltr" value={draft.minTons} onChange={(e) => setDraft({ ...draft, minTons: e.target.value })} data-testid="sf-cat-min" /></label>
          <label className="text-[11px] font-bold text-slate-600">الحد الأعلى (طن)<input className={input} inputMode="decimal" dir="ltr" value={draft.maxTons} onChange={(e) => setDraft({ ...draft, maxTons: e.target.value })} /></label>
          <label className="text-[11px] font-bold text-slate-600">وجهة الوزن في المحطة
            <select className={input} value={draft.weighing} onChange={(e) => setDraft({ ...draft, weighing: e.target.value as CatDraft['weighing'] })} data-testid="sf-cat-weigh">
              <option value="">لا تُوزن في المحطة</option>
              {(Object.keys(WEIGH_AR) as WeighingDestination[]).map((k) => <option key={k} value={k}>{WEIGH_AR[k]}</option>)}
            </select></label>
          <label className="text-[11px] font-bold text-slate-600">الترتيب<input className={input} inputMode="numeric" value={draft.sort} onChange={(e) => setDraft({ ...draft, sort: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.stationOutbound} onChange={(e) => setDraft({ ...draft, stationOutbound: e.target.checked })} data-testid="sf-cat-outbound" /> فئة خروج من المحطة</label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.garageUsable} onChange={(e) => setDraft({ ...draft, garageUsable: e.target.checked })} /> تُستخدم في الكراج</label>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} data-testid="sf-cat-active" /> فعّالة</label>
          {error && <p className="text-xs font-bold text-rose-600 md:col-span-4" role="alert">{error}</p>}
          <div className="flex gap-2 md:col-span-4">
            <button type="button" className={btnDark} onClick={submit} disabled={save.isPending} data-testid="sf-cat-save"><Save size={14} /> حفظ</button>
            <button type="button" className={btnLight} onClick={() => setDraft(null)}><X size={14} /> إلغاء</button>
          </div>
        </div>
      )}
      {list.isLoading ? <LoadingSpinner /> : (
        <table className="mt-3 w-full text-xs" data-testid="sf-cat-table">
          <thead><tr className="bg-slate-50 text-[11px] text-slate-500"><th className="p-2 text-right">الفئة</th><th className="p-2 text-right">الرمز</th><th className="p-2 text-center">الحد الأدنى</th><th className="p-2 text-center">الحد الأعلى</th><th className="p-2 text-right">وجهة الوزن</th><th className="p-2 text-center">خروج</th><th className="p-2 text-center">كراج</th><th className="p-2 text-center">الحالة</th><th className="p-2" /></tr></thead>
          <tbody>
            {(list.data ?? []).map((c) => (
              <tr key={c.code} className={`border-t ${c.active ? '' : 'text-slate-400'}`} data-testid={`sf-cat-${c.code}`}>
                <td className="p-2 font-bold">{c.label}</td><td className="p-2" dir="ltr">{c.code}</td>
                <td className="p-2 text-center tabular-nums">{c.min_tons ?? '—'}</td><td className="p-2 text-center tabular-nums">{c.max_tons ?? '—'}</td>
                <td className="p-2">{c.weighing_destination ? WEIGH_AR[c.weighing_destination] : '—'}</td>
                <td className="p-2 text-center">{c.station_outbound ? <Check size={14} className="mx-auto text-emerald-600" /> : '—'}</td>
                <td className="p-2 text-center">{c.garage_usable ? <Check size={14} className="mx-auto text-emerald-600" /> : '—'}</td>
                <td className="p-2 text-center">{c.active ? 'فعّالة' : 'موقوفة'}</td>
                <td className="p-2 text-left"><button type="button" className={btnLight} onClick={() => { setError(null); setDraft(toCatDraft(c)) }} data-testid={`sf-cat-edit-${c.code}`}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
