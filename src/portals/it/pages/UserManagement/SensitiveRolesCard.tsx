/**
 * الجولة ٢ — الأدوار الحساسة: القائمة التسعة صارت بيانات قابلة للتعديل (جدول sensitive_roles).
 * تُعرض هنا للأدوار الحساسة: التفعيل/التعطيل + عدد الحاملين + السبب.
 * القرار في الخادم: التعطيل يجعل الدور يُمنح مباشرة، والتفعيل يعيده لمسار الموافقة.
 * it_admin و super_admin لا يمكن تعطيل حمايتهما (أرضية أمان في القاعدة).
 */
import clsx from 'clsx'
import { useSensitiveRoles, useSetSensitiveRole } from '@features/user-management/hooks/useSensitiveRoles'

const LOCKED = new Set(['it_admin', 'super_admin'])

export function SensitiveRolesCard() {
  const { data, isLoading } = useSensitiveRoles()
  const setRole = useSetSensitiveRole()

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"
      aria-label="الأدوار الحساسة"
      data-testid="sensitive-roles-card"
    >
      <h3 className="text-xs font-bold text-slate-500">الأدوار الحساسة (تسعة)</h3>
      <p className="mt-1 text-[11px] text-slate-500">
        الدور المفعّل لا يُمنح ولا يُسحب إلا بطلب موافقة من المدير المفوض، ولا يطلبه إلا تقنية المعلومات.
        تعطيل الحماية يجعل الدور يُمنح مباشرةً — يُسجَّل كل تعديل في التدقيق.
      </p>

      {isLoading ? (
        <p className="py-3 text-center text-xs text-slate-400">جارٍ التحميل…</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-50" data-testid="sensitive-roles-list">
          {(data ?? []).map((r) => (
            <li key={r.role} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-slate-800">{r.label}</span>
                <span className="block truncate text-[10px] text-slate-400" dir="ltr">
                  {r.role} · {r.holders} حامل
                </span>
              </span>
              <span
                className={clsx(
                  'shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold',
                  r.active ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500',
                )}
              >
                {r.active ? 'محميّ' : 'مفتوح'}
              </span>
              <button
                type="button"
                data-testid={`sensitive-toggle-${r.role}`}
                disabled={setRole.isPending || LOCKED.has(r.role)}
                title={LOCKED.has(r.role) ? 'لا يمكن تعطيل حماية هذا الدور' : undefined}
                onClick={() => setRole.mutate({ role: r.role, active: !r.active })}
                className={clsx(
                  'h-8 shrink-0 rounded-lg px-3 text-[11px] font-bold disabled:opacity-40',
                  r.active ? 'bg-slate-100 text-slate-700' : 'bg-amber-600 text-white',
                )}
              >
                {r.active ? 'تعطيل' : 'تفعيل'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
