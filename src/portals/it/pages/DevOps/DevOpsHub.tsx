/** 00275 — وحدة «دليل التشغيل التقني»: Git ورفع التحديثات (هذه الجولة) + أدلة الجولات التالية (قاعدة البيانات/الاختبارات، الاستضافة والبصمة، لوحة الحالة) */
import { UnitHub, type HubPageLink } from '@components/layout/UnitHub'
import { GUIDES } from '@features/devops-guide'

const PAGES: readonly HubPageLink[] = [
  { path: '/it/devops/git', label: 'Git ورفع التحديثات', hint: 'الباتشات، الرفع إلى GitHub، أوامر الإنقاذ', icon: 'upload' },
]

export default function DevOpsHub() {
  const total = GUIDES.reduce((n, g) => n + g.sections.reduce((m, s) => m + (s.commands?.length ?? 0) + (s.steps?.filter((x) => x.cmd).length ?? 0), 0), 0)
  return (
    <UnitHub title="دليل التشغيل التقني" description="كل ما هو تقني في المنصة مشروحاً بلغة بسيطة: ماذا يفعل كل أمر، متى تستخدمه، مثال من مشروعنا، وماذا تفعل إن فشل." pages={PAGES} testId="hub-devops">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="devops-stats">
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">الأدلة</p><b className="text-2xl">{GUIDES.length}</b></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">الأوامر المشروحة</p><b className="text-2xl">{total}</b></div>
        <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">قادم</p><b className="text-xs">قاعدة البيانات والاختبارات · الاستضافة والبصمة · لوحة الحالة الحية</b></div>
      </div>
    </UnitHub>
  )
}
