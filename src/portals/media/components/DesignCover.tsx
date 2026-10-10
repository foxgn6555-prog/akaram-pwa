/**
 * 00200 — عرض غلاف التصميم أياً كان نوعه: قالب جاهز (builtin:…) بنصوص حيّة، أو صورة مرفوعة/من المكتبة.
 */
import { coverTemplateById, builtinCoverId, type CoverContext } from '@features/media/lib/cover-templates'
import CoverTemplate from './CoverTemplate'

export default function DesignCover({ coverPath, coverUrl, ctx, className = '', alt = 'الغلاف', imgClassName = '' }: { coverPath: string | null | undefined; coverUrl?: string | null; ctx: CoverContext; className?: string; alt?: string; imgClassName?: string }) {
  const def = coverTemplateById(builtinCoverId(coverPath))
  if (def) return <CoverTemplate def={def} ctx={ctx} className={className} />
  if (coverUrl) return <img src={coverUrl} alt={alt} className={imgClassName || className} />
  return null
}
