/**
 * حقول تهيئة مصدر البصمة حسب النمط — مكوّن متحكَّم به (بلا مكتبة نماذج) ليُعاد استخدامه
 * في التسجيل والتعديل. يبني BiometricDeviceConfig صالحة لكل نمط.
 */
import { useState } from 'react'
import type { BiometricDeviceConfig, BiometricMode } from '@features/integrations'

export interface SourceConfigFieldsProps {
  mode: BiometricMode
  value: BiometricDeviceConfig
  onChange: (next: BiometricDeviceConfig) => void
  idPrefix?: string
}

const field = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm'
const label = 'mb-1.5 block text-sm font-medium'

export function SourceConfigFields({ mode, value, onChange, idPrefix = 'src' }: SourceConfigFieldsProps) {
  if (mode === 'adms_push') return null
  const set = <K extends keyof BiometricDeviceConfig>(k: K, v: BiometricDeviceConfig[K]) => onChange({ ...value, [k]: v })
  const mapping = value.mapping ?? { pin: '' }
  const setMap = (k: keyof NonNullable<BiometricDeviceConfig['mapping']>, v: string) =>
    onChange({ ...value, mapping: { ...mapping, [k]: v } })
  const id = (s: string) => `${idPrefix}-${s}`

  return (
    <div className="grid gap-4 sm:grid-cols-3" data-testid="source-config-fields" data-mode={mode}>
      <div className="sm:col-span-2">
        <label htmlFor={id('base-url')} className={label}>رابط الأساس (base_url) *</label>
        <input id={id('base-url')} data-testid="cfg-base-url" dir="ltr" required className={field}
          placeholder={mode === 'lan_pull' ? 'http://192.168.1.50' : 'https://vendor.example/api'}
          value={value.base_url ?? ''} onChange={(e) => set('base_url', e.target.value)} />
      </div>
      <div>
        <label htmlFor={id('path')} className={label}>المسار (اختياري)</label>
        <input id={id('path')} data-testid="cfg-path" dir="ltr" className={field}
          placeholder={mode === 'app_api_pull' ? '/attendance/logs' : mode === 'lan_pull' ? '/api/attlog' : '/'}
          value={value.path ?? ''} onChange={(e) => set('path', e.target.value)} />
      </div>

      <div>
        <label htmlFor={id('api-key')} className={label}>مفتاح API</label>
        <input id={id('api-key')} data-testid="cfg-api-key" dir="ltr" type="password" autoComplete="off" className={field}
          value={value.api_key ?? ''} onChange={(e) => set('api_key', e.target.value)} />
      </div>
      <div>
        <label htmlFor={id('api-key-header')} className={label}>ترويسة المفتاح</label>
        <input id={id('api-key-header')} data-testid="cfg-api-key-header" dir="ltr" className={field} placeholder="X-API-Key"
          value={value.api_key_header ?? ''} onChange={(e) => set('api_key_header', e.target.value)} />
      </div>
      <div>
        <label htmlFor={id('tz')} className={label}>منطقة أوقات المصدر</label>
        <input id={id('tz')} data-testid="cfg-tz" dir="ltr" className={field} placeholder="+03:00"
          value={value.timezone_offset ?? ''} onChange={(e) => set('timezone_offset', e.target.value)} />
      </div>

      {mode === 'lan_pull' && (
        <>
          <div>
            <label htmlFor={id('basic-user')} className={label}>مستخدم الجهاز (Basic)</label>
            <input id={id('basic-user')} data-testid="cfg-basic-user" dir="ltr" className={field}
              value={value.basic_user ?? ''} onChange={(e) => set('basic_user', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('basic-pass')} className={label}>كلمة مرور الجهاز</label>
            <input id={id('basic-pass')} data-testid="cfg-basic-pass" dir="ltr" type="password" autoComplete="off" className={field}
              value={value.basic_pass ?? ''} onChange={(e) => set('basic_pass', e.target.value)} />
          </div>
        </>
      )}

      {mode !== 'lan_pull' && (
        <div>
          <label htmlFor={id('bearer')} className={label}>رمز Bearer (بديل المفتاح)</label>
          <input id={id('bearer')} data-testid="cfg-bearer" dir="ltr" type="password" autoComplete="off" className={field}
            value={value.auth_bearer ?? ''} onChange={(e) => set('auth_bearer', e.target.value)} />
        </div>
      )}

      <div>
        <label htmlFor={id('from-param')} className={label}>معامل البداية</label>
        <input id={id('from-param')} data-testid="cfg-from-param" dir="ltr" className={field} placeholder="from"
          value={value.from_param ?? ''} onChange={(e) => set('from_param', e.target.value)} />
      </div>
      <div>
        <label htmlFor={id('to-param')} className={label}>معامل النهاية</label>
        <input id={id('to-param')} data-testid="cfg-to-param" dir="ltr" className={field} placeholder="to"
          value={value.to_param ?? ''} onChange={(e) => set('to_param', e.target.value)} />
      </div>

      {mode === 'generic_pull' && (
        <fieldset className="grid gap-3 rounded-xl border border-dashed border-slate-300 p-3 sm:col-span-3 sm:grid-cols-3" data-testid="cfg-mapping">
          <legend className="px-1 text-xs font-bold text-slate-600">خريطة الحقول (اسم الحقل في استجابة المصدر — يدعم المسار المنقّط a.b)</legend>
          <div className="sm:col-span-3">
            <label htmlFor={id('records-path')} className={label}>مسار مصفوفة السجلات</label>
            <input id={id('records-path')} data-testid="cfg-records-path" dir="ltr" className={field} placeholder="data.records (اتركه فارغاً للمصفوفة المباشرة)"
              value={value.records_path ?? ''} onChange={(e) => set('records_path', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('map-pin')} className={label}>حقل PIN *</label>
            <input id={id('map-pin')} data-testid="cfg-map-pin" dir="ltr" required className={field} placeholder="employee_id"
              value={mapping.pin} onChange={(e) => setMap('pin', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('map-at')} className={label}>حقل الوقت الكامل</label>
            <input id={id('map-at')} data-testid="cfg-map-at" dir="ltr" className={field} placeholder="timestamp"
              value={mapping.at ?? ''} onChange={(e) => setMap('at', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('map-direction')} className={label}>حقل الاتجاه</label>
            <input id={id('map-direction')} data-testid="cfg-map-direction" dir="ltr" className={field} placeholder="type"
              value={mapping.direction ?? ''} onChange={(e) => setMap('direction', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('map-date')} className={label}>حقل التاريخ (إن كان منفصلاً)</label>
            <input id={id('map-date')} data-testid="cfg-map-date" dir="ltr" className={field} placeholder="date"
              value={mapping.date ?? ''} onChange={(e) => setMap('date', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('map-time')} className={label}>حقل الوقت (إن كان منفصلاً)</label>
            <input id={id('map-time')} data-testid="cfg-map-time" dir="ltr" className={field} placeholder="time"
              value={mapping.time ?? ''} onChange={(e) => setMap('time', e.target.value)} />
          </div>
          <div>
            <label htmlFor={id('map-name')} className={label}>حقل الاسم</label>
            <input id={id('map-name')} data-testid="cfg-map-name" dir="ltr" className={field} placeholder="name"
              value={mapping.name ?? ''} onChange={(e) => setMap('name', e.target.value)} />
          </div>
          <div className="sm:col-span-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={id('in-values')} className={label}>قيم «دخول» (مفصولة بفاصلة)</label>
              <ListInput id={id('in-values')} testId="cfg-in-values" placeholder="0, in, ENTER"
                value={value.in_values} onChange={(v) => set('in_values', v)} />
            </div>
            <div>
              <label htmlFor={id('out-values')} className={label}>قيم «خروج»</label>
              <ListInput id={id('out-values')} testId="cfg-out-values" placeholder="1, out, LEAVE"
                value={value.out_values} onChange={(v) => set('out_values', v)} />
            </div>
          </div>
        </fieldset>
      )}
    </div>
  )
}

/** حقل قائمة بفواصل: يحتفظ بالنص كما يكتبه المستخدم (كي لا تُبتلع الفاصلة الختامية) ويصدّر مصفوفة نظيفة */
function ListInput({ id, testId, placeholder, value, onChange }: {
  id: string; testId: string; placeholder: string; value?: string[]; onChange: (v: string[] | undefined) => void
}) {
  const [text, setText] = useState((value ?? []).join(', '))
  return (
    <input id={id} data-testid={testId} dir="ltr" className={field} placeholder={placeholder} value={text}
      onChange={(e) => { setText(e.target.value); onChange(splitList(e.target.value)) }} />
  )
}

function splitList(s: string): string[] | undefined {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean)
  return arr.length ? arr : undefined
}
