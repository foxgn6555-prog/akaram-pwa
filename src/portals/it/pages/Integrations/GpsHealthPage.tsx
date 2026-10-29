/** 00211 — وحدة التطوير المركزية: سلامة تكامل GPS (LVN والمزامنة) — منقولة من غرفة العمليات */
import LvnIntegrationWorkspace from '@features/gps-lvn/components/LvnIntegrationWorkspace'
import GpsWarehouseCard from '@features/gps-warehouse/GpsWarehouseCard'

export default function GpsHealthPage() {
  return (
    <section aria-labelledby="gps-health-title" className="space-y-4" data-testid="it-gps-health-page">
      <div>
        <h1 id="gps-health-title" className="text-lg font-bold">سلامة تكامل GPS (LVN)</h1>
        <p className="text-xs text-slate-500">خط البيانات، اختبار الاتصال، المزامنة، تشخيص المجدول الخادمي، وسجل المزامنة مع شرح أي فشل</p>
      </div>
      <LvnIntegrationWorkspace />
      {/* 00380: مستودع GPS التحليلي (المشروع الثاني) */}
      <GpsWarehouseCard />
    </section>
  )
}
