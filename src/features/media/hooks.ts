/**
 * Hooks — بوابة الإعلام: تذاكر الصور والتصاميم
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mediaService,
  type CampaignDetails,
  type MediaDesign,
  type MediaDesignTemplate,
  type MediaSubmission,
} from '@sdk/media.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

const ERROR_MAP: Record<string, string> = {
  MEDIA_FORBIDDEN: 'ليست لديك صلاحية هذه العملية في الإعلام',
  MEDIA_PHOTOS_COUNT_INVALID: 'عدد الصور يجب أن يكون بين 1 و500',
  MEDIA_PHOTO_PATH_INVALID: 'مسار صورة غير صالح — أعد المحاولة',
  MEDIA_SUBMISSION_INPUT_INVALID: 'تحقق من الحقول المطلوبة (2–200 حرف)',
  MEDIA_MANAGER_PROFILE_MISSING: 'ملف المسؤول غير موجود في النظام',
  MEDIA_SECTOR_DERIVE_FAILED: 'تعذر اشتقاق القاطع من ملف المسؤول',
  MEDIA_SUBMISSION_NOT_FOUND: 'التذكرة غير موجودة',
  MEDIA_SUBMISSION_NOT_ARCHIVABLE: 'لا يمكن أرشفة التذكرة في وضعها الحالي',
  MEDIA_DESIGN_INPUT_INVALID: 'تحقق من بيانات التصميم',
  MEDIA_DESIGN_PHOTOS_INVALID: 'اختر صورة واحدة على الأقل للتصميم (500 كحد أقصى)',
  MEDIA_DESIGN_PHOTO_NOT_FOUND: 'الصورة غير موجودة',
  MEDIA_DESIGN_NOT_FOUND: 'التصميم غير موجود',
  MEDIA_DESIGN_LOCKED: 'التصميم مكتمل ومقفل — لا يمكن تعديله',
  MEDIA_DESIGN_NOT_COMPLETABLE: 'لا يمكن إكمال التصميم بدون صور',
  MEDIA_DESIGN_NOT_DELETABLE: 'لا يمكن حذف تصميم مكتمل',
  MEDIA_COUNT_INVALID: 'الأعداد (مراقبون/عمال/آليات) يجب أن تكون أرقاماً صحيحة غير سالبة',
  MEDIA_EXEC_DATE_INVALID: 'تاريخ تنفيذ الحملة لا يمكن أن يكون في المستقبل',
  MEDIA_MERGE_MIN_TWO: 'اختر تذكرتين على الأقل للدمج',
  MEDIA_MERGE_NOT_ACTIVE: 'إحدى التذاكر مؤرشفة أو دُمجت سابقاً',
  MEDIA_MERGE_DIFFERENT_SECTORS: 'لا يمكن دمج تذاكر من قاطعين مختلفين',
  OPS_ROOM_FORBIDDEN: 'هذه الصفحة لغرفة العمليات فقط',
}

const friendly = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e ?? '')
  const code = (raw.split(':')[0] ?? '').trim()
  return ERROR_MAP[code] ?? handleAppError(e, { scope: 'media' }).message
}

const useMediaAction = <TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  successMessage: string,
  keys: string[] = ['media'],
) => {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (args: TArgs) => fn(...args),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys })
      toast({ type: 'success', message: successMessage })
    },
    onError: (e) =>
      toast({ type: 'error', message: friendly(e) }),
  })
}

/* ── تذاكر مسؤول القسم ── */
export const useMySubmissions = (from: string | null = null, to: string | null = null, mode: string | null = null) =>
  useQuery({
    queryKey: ['media', 'my-submissions', from ?? '', to ?? '', mode ?? ''],
    queryFn: () => mediaService.mySubmissions(from, to, mode),
  })

export const useSendPhotos = () =>
  useMediaAction(
    (
      mode: string,
      title: string,
      work: string | null,
      notes: string,
      photos: Array<{ storagePath: string; caption: string }>,
      details: CampaignDetails | null = null,
    ) => mediaService.sendPhotos(mode, title, work, notes, photos, details),
    'أُرسلت التذكرة إلى بوابة الإعلام',
    ['media', 'my-submissions', 'sector-photos'],
  )

/* ── بوابة الإعلام: التذكرات ── */
export const useSubmissions = (
  sector: string | null,
  status: 'active' | 'archived' | 'all' = 'active',
  workType: string | null = null,
) =>
  useQuery({
    queryKey: ['media', 'submissions', sector, status, workType],
    queryFn: () => mediaService.listSubmissions(sector, status, workType),
    refetchInterval: 60_000,
  })

export const useSubmissionPhotos = (submissionId: string | null) =>
  useQuery({
    queryKey: ['media', 'submission-photos', submissionId],
    queryFn: () => mediaService.submissionPhotos(submissionId as string),
    enabled: Boolean(submissionId),
  })

export const useSignedPhotoUrls = (paths: string[]) =>
  useQuery({
    queryKey: ['media', 'signed-urls', paths.join('|')],
    queryFn: () => mediaService.signedUrls(paths),
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
  })

export const useUpdateSubmission = () =>
  useMediaAction(
    (
      id: string,
      meta: { title: string; workType: string | null; eventDate: string | null; notes: string },
    ) => mediaService.updateSubmission(id, meta),
    'حُدثت معلومات التذكرة',
  )

export const useUpdatePhotoCaption = () =>
  useMediaAction(
    (id: string, caption: string) => mediaService.updatePhotoCaption(id, caption),
    'حُفظ وصف الصورة',
  )

export const useArchiveSubmission = () =>
  useMediaAction(
    (id: string, reason: string) => mediaService.archiveSubmission(id, reason),
    'أُرشفت التذكرة',
  )

/* ── التصاميم ── */
export const useDesigns = (sector: string | null = null) =>
  useQuery({
    queryKey: ['media', 'designs', sector],
    queryFn: () => mediaService.listDesigns(sector),
    refetchInterval: 60_000,
  })

export const useDesignDetail = (designId: string | null) =>
  useQuery({
    queryKey: ['media', 'design-detail', designId],
    queryFn: () => mediaService.designDetail(designId as string),
    enabled: Boolean(designId),
  })

export const useCreateDesign = () =>
  useMediaAction(
    (
      sectorParent: string,
      periodType: string,
      title: string,
      coverPath: string | null,
      photos: Array<{ photoId: string; workType: string; caption: string }>,
    ) => mediaService.createDesign(sectorParent, periodType, title, coverPath, photos),
    'أُنشئ التصميم بالصور المحددة',
  )

export const useUpdateDesign = () =>
  useMediaAction(
    (id: string, meta: { title: string; periodType: string; coverPath: string | null }) =>
      mediaService.updateDesign(id, meta),
    'حُفظ التصميم',
  )

export const useAddDesignPhotos = () =>
  useMediaAction(
    (id: string, photos: Array<{ photoId: string; workType: string; caption: string }>) =>
      mediaService.addDesignPhotos(id, photos),
    'أُضيفت الصور إلى التصميم',
  )

export const useRemoveDesignPhoto = () =>
  useMediaAction((id: string) => mediaService.removeDesignPhoto(id), 'حُذفت الصورة من التصميم')

export const useCompleteDesign = () =>
  useMediaAction((id: string) => mediaService.completeDesign(id), 'اكتمل التصميم وأُغلق للتعديل')

export const useDeleteDesign = () =>
  useMediaAction((id: string) => mediaService.deleteDesign(id), 'حُذف التصميم')

export const useSaveDesignReport = (designId: string) =>
  useMediaAction(
    (
      sheets: Array<{ workType: string; text: string }>,
      captions: Array<{ rowId: string; text: string; fit?: 'contain' | 'cover'; zoom?: number }>,
      extra?: { summary?: unknown; colors?: unknown; style?: unknown },
    ) => mediaService.saveDesignReport(designId, sheets, captions, extra),
    'حُفظت تعديلات نص التقرير والعبارات',
    ['media', 'design-detail', designId],
  )

export const useReorderDesignPhotos = (designId: string) =>
  useMediaAction(
    (items: Array<{ rowId: string; workType: string; sortOrder: number }>) =>
      mediaService.reorderDesignPhotos(designId, items),
    'حُفظ ترتيب الصور',
    ['media', 'design-detail', designId],
  )

export const useUploadCover = () =>
  useMediaAction(
    (file: File) => mediaService.uploadCover(file),
    'رُفع غلاف التصميم',
  )

export const useUploadPhotos = () =>
  useMediaAction(
    (files: File[]) => mediaService.uploadPhotos(files),
    'رُفعت الصور إلى التخزين',
  )

/* ── قوالب التصميم (الهوية البصرية) ── */
export interface MediaTemplateInput {
  title: string
  sectorParent: string | null
  periodType: string
  coverPath: string | null
  workTypes: string[]
  notes: string
}

export const useMediaTemplates = (includeArchived = false) =>
  useQuery({
    queryKey: ['media', 'templates', includeArchived],
    queryFn: () => mediaService.listTemplates(includeArchived),
  })

export const useCreateMediaTemplate = () =>
  useMediaAction(
    (args: MediaTemplateInput) => mediaService.createTemplate(args),
    'أُنشئ قالب التصميم',
  )

export const useUpdateMediaTemplate = () =>
  useMediaAction(
    (id: string, args: MediaTemplateInput) => mediaService.updateTemplate(id, args),
    'حُفظ قالب التصميم',
  )

export const useArchiveMediaTemplate = () =>
  useMediaAction((id: string) => mediaService.archiveTemplate(id), 'أُرشف القالب')

export type { MediaDesign, MediaSubmission, MediaDesignTemplate }

/* ── 00164: دمج التذاكر (الإعلام) + تقرير غرفة العمليات ── */
export const useMergeSubmissions = () =>
  useMediaAction(
    (ids: string[], title: string, workType: string | null, notes: string | null = null) => mediaService.mergeSubmissions(ids, title, workType, notes),
    'دُمجت التذاكر في تذكرة واحدة',
  )
export const useOpsCampaigns = (f: { mode?: string | null; sectorParent?: string | null; sectorId?: number | null; from?: string | null; to?: string | null }) =>
  useQuery({
    queryKey: ['media', 'ops-campaigns', f.mode ?? '', f.sectorParent ?? '', f.sectorId ?? '', f.from ?? '', f.to ?? ''],
    queryFn: () => mediaService.opsCampaignsReport(f),
    refetchInterval: 60_000,
  })
