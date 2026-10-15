/**
 * بوابة المتعهد — إرسال الصور (00257)
 * نفس وحدة «إرسال الصور» عند مسؤول القسم حرفياً، لكن القاطع/المنطقة يُشتقان من ملف المتعهد
 * (منطقته = إحدى مناطق مسؤول قسمه)، والتذكرة تصل الإعلام وغرفة العمليات موسومة «متعهد — منطقة …».
 */
import { useContractorMe } from '@features/contractors/hooks'
import { PARENT_AR } from '@features/contractors/format'
import { MAX_PHOTOS, type SectorParent } from '@features/media/constants'
import PhotosPage from '@portals/manager/pages/Photos/PhotosPage'
import { LoadingSpinner } from '@components/feedback/LoadingSpinner'
import { EmptyState } from '@components/feedback/EmptyState'
import { ExecPageHeader } from '@components/executive/ExecPageHeader'

export default function ContractorPhotosPage() {
  const me = useContractorMe()
  if (me.isLoading) return <LoadingSpinner />
  if (!me.data) return <EmptyState title="لم تُعيَّن بعد متعهداً على منطقة" hint="تسند التطوير المركزية حسابك إلى مسؤول قسم فتُشتق منطقتك تلقائياً — بعدها يمكنك إرسال الصور" />
  const m = me.data
  return (
    <div className="space-y-6" data-testid="contractor-photos" data-sector={m.sector_id} data-manager={m.manager_user_id}>
      <ExecPageHeader icon="camera" title="إرسال صور إلى الإعلام" subtitle={`منطقتك ${m.area_name} · ${PARENT_AR[m.parent_sector] ?? m.parent_sector} — تصل الصور إلى الإعلام وغرفة العمليات باسمك بوصفك متعهد المنطقة (حتى ${MAX_PHOTOS} صورة).`} />
      <PhotosPage scope={{ parent: m.parent_sector as SectorParent, sectionNames: `${m.area_name} (مسؤول القسم: ${m.manager_name})` }} />
    </div>
  )
}
