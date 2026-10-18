/**
 * البث المباشر — الإعدادات (التطوير المركزية · 00288)
 *  · الفاصل الزمني لإرسال الموقع من هاتف مسؤول القسم/المتعهد (الافتراضي 15 دقيقة)
 *  · مدة الاحتفاظ بالبيانات (الافتراضي 30 يوماً) — ما يتجاوزها يُحذف تلقائياً
 *  · الصلاحية: الأهلية من الدور (مسؤول قسم/متعهد) والشفت من الموارد البشرية — لا تُضبط هنا
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useLiveSettings, useSetLiveSettings } from '@features/live-tracking/useLiveMap'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'

export default function LiveTrackingSettingsPage() {
  const q = useLiveSettings(), save = useSetLiveSettings()
  const [interval, setInterval_] = useState('15'); const [retention, setRetention] = useState('30')
  useEffect(() => { if (q.data) { setInterval_(String(q.data.ping_interval_minutes)); setRetention(String(q.data.retention_days)) } }, [q.data])
  const i = Number(interval), r = Number(retention)
  const invalid = !Number.isInteger(i) || i < 1 || i > 120 || !Number.isInteger(r) || r < 7 || r > 3650
  return (
    <div className="space-y-5 pb-6" data-testid="it-live-tracking">
      <header>
        <h1 className="text-lg font-black">البث المباشر — الإعدادات</h1>
        <p className="text-xs text-slate-600">مسؤول القسم والمتعهد يشاركان موقعهما أثناء شفت الموارد البشرية فقط (من <Link to="/it/integrations/hr-policy" className="font-bold text-indigo-700 underline">سياسة الدوام</Link> وشفت الموظف المرتبط). الخصوصية: لا تتبع خارج الشفت، والبيانات تُحذف بعد مدة الاحتفاظ. غرفة العمليات ترى الخريطة والبيانات.</p>
      </header>
      {q.isLoading ? <LoadingSpinner /> : (
        <section className="max-w-xl rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-700">الفاصل الزمني لإرسال الموقع (دقائق)
              <input type="number" min={1} max={120} value={interval} data-testid="live-interval" onChange={(e) => setInterval_(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 text-sm font-black tabular-nums" />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">من 1 إلى 120 دقيقة. الموصى به 15 — كل فتحة للتطبيق ترسل فوراً ثم كل هذا الفاصل.</span>
            </label>
            <label className="block text-xs font-bold text-slate-700">مدة الاحتفاظ بالبيانات (أيام)
              <input type="number" min={7} max={3650} value={retention} data-testid="live-retention" onChange={(e) => setRetention(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 text-sm font-black tabular-nums" />
              <span className="mt-1 block text-[10px] font-normal text-slate-500">من 7 إلى 3650 يوماً. الموصى به 30 — الجلسات والنقاط الأقدم تُحذف تلقائياً.</span>
            </label>
          </div>
          {invalid && <p role="alert" className="mt-2 text-xs font-bold text-red-700" data-testid="live-settings-invalid">القيم خارج النطاق المسموح.</p>}
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">آخر تحديث: {q.data ? new Date(q.data.updated_at).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad' }) : '—'}</span>
            <button type="button" disabled={invalid || save.isPending} data-testid="live-settings-save" onClick={() => save.mutate({ intervalMinutes: i, retentionDays: r })}
              className="h-10 rounded-xl bg-indigo-700 px-5 text-sm font-black text-white disabled:opacity-50">{save.isPending ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </div>
        </section>
      )}
    </div>
  )
}
