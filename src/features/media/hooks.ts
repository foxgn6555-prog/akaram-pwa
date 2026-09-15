/**
 * Hooks — بوابة الإعلام: تذاكر الصور والتصاميم
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  mediaService,
  type MediaDesign,
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
}

const friendly = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : String(e ?? '')
  const code = raw.split(':')[0].trim()
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
export const useMySubmissions = () =>
  useQuery({
    queryKey: ['media', 'my-submissions'],
    queryFn: () => mediaService.mySubmissions(),
  })

export const useSendPhotos = () =>
  useMediaAction(
    (args: [string, string, string | null, string, Array<{ storagePath: string; caption: string }>]) =>
      mediaService.sendPhotos(...args),
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
    (args: [string, { title: string; workType: string | null; eventDate: string | null; notes: string }]) =>
      mediaService.updateSubmission(...args),
    'حُدثت معلومات التذكرة',
  )

export const useUpdatePhotoCaption = () =>
  useMediaAction(
    (args: [string, string]) => mediaService.updatePhotoCaption(...args),
    'حُفظ وصف الصورة',
  )

export const useArchiveSubmission = () =>
  useMediaAction(
    (args: [string, string]) => mediaService.archiveSubmission(...args),
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
    (args: [
      string,
      string,
      string,
      string | null,
      Array<{ photoId: string; workType: string; caption: string }>,
    ]) => mediaService.createDesign(...args),
    'أُنشئ التصميم بالصور المحددة',
  )

export const useUpdateDesign = () =>
  useMediaAction(
    (args: [string, { title: string; periodType: string; coverPath: string | null }]) =>
      mediaService.updateDesign(...args),
    'حُفظ التصميم',
  )

export const useAddDesignPhotos = () =>
  useMediaAction(
    (args: [string, Array<{ photoId: string; workType: string; caption: string }>]) =>
      mediaService.addDesignPhotos(...args),
    'أُضيفت الصور إلى التصميم',
  )

export const useRemoveDesignPhoto = () =>
  useMediaAction((args: [string]) => mediaService.removeDesignPhoto(...args), 'حُذفت الصورة من التصميم')

export const useCompleteDesign = () =>
  useMediaAction(
    (args: [string]) => mediaService.completeDesign(...args),
    'اكتمل التصميم وأُغلق للتعديل',
  )

export const useDeleteDesign = () =>
  useMediaAction((args: [string]) => mediaService.deleteDesign(...args), 'حُذف التصميم')

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

export type { MediaDesign, MediaSubmission }
