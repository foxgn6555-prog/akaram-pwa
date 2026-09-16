/**
 * SDK — بوابة الإعلام: تذاكر الصور والتصاميم
 * القاعدة: كل وصول للبيانات عبر @sdk (بما فيه Supabase Storage)
 */
import { sdkGuard, supabase } from './client'

export interface MediaSubmission {
  id: string
  mode: string
  title: string
  work_type: string | null
  sector_parent: string
  sector_ids: number[]
  event_date: string
  notes: string | null
  photo_count: number
  status: 'submitted' | 'archived'
  submitted_by: string
  submitted_by_name: string
  archived_at: string | null
  archive_reason: string | null
  created_at: string
}

export interface MediaSubmissionPhoto {
  id: string
  submission_id: string
  storage_path: string
  caption: string | null
  sort_order: number
  created_at: string
}

export interface MediaDesign {
  id: string
  sector_parent: string
  period_type: string
  period_start: string
  period_end: string
  title: string
  cover_image_path: string | null
  status: 'draft' | 'completed'
  photo_count: number
  created_by: string
  created_at: string
  completed_at: string | null
  summary?: Record<string, unknown> | null
  template_colors?: Record<string, string> | null
}

export interface MediaDesignTemplate {
  id: string
  title: string
  sector_parent: string | null
  period_type: string
  cover_path: string | null
  work_types: string[]
  notes: string
  status: string
  created_at: string
  updated_at: string
}

export interface MediaDesignPhoto {
  photo_id: string
  source_photo_id: string | null
  source_submission_id: string | null
  work_type: string
  storage_path: string
  caption: string | null
  report_caption: string | null
  display_fit: 'contain' | 'cover'
  display_zoom: number
  sort_order: number
}

export interface MediaDesignSheet {
  work_type: string
  sheet_text: string
}

export interface MediaDesignDetail {
  design: MediaDesign
  photos: MediaDesignPhoto[]
  sheets: MediaDesignSheet[]
}

export interface MediaDraftPhoto {
  storagePath: string
  caption: string
}

const BUCKET = 'media-photos'

export const mediaService = {
  /* ── تذاكر مسؤول القسم ── */
  async sendPhotos(
    mode: string,
    title: string,
    workType: string | null,
    notes: string,
    photos: MediaDraftPhoto[],
  ): Promise<MediaSubmission> {
    return (await sdkGuard(
      supabase.rpc('media_send_photos', {
        p_mode: mode,
        p_title: title,
        p_work_type: workType || null,
        p_notes: notes || null,
        p_photos: photos.map((p) => ({ storage_path: p.storagePath, caption: p.caption })),
      }),
    )) as unknown as MediaSubmission
  },

  /** تذكراتي كمسؤول قسم (قراءة مباشرة عبر RLS — صاحب الرفع) */
  async mySubmissions(): Promise<MediaSubmission[]> {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id
    if (!uid) return []
    const rows = await sdkGuard(
      supabase
        .from('media_submissions')
        .select('*')
        .eq('submitted_by', uid)
        .order('created_at', { ascending: false })
        .limit(100),
    )
    return ((rows ?? []) as unknown as MediaSubmission[])
  },

  async listSubmissions(
    sectorParent: string | null = null,
    status: 'active' | 'archived' | 'all' = 'active',
    workType: string | null = null,
  ): Promise<MediaSubmission[]> {
    return ((await sdkGuard(
      supabase.rpc('media_submissions_list', {
        p_sector_parent: sectorParent,
        p_status: status,
        p_work_type: workType,
      }),
    )) ?? []) as unknown as MediaSubmission[]
  },

  async submissionPhotos(submissionId: string): Promise<MediaSubmissionPhoto[]> {
    return ((await sdkGuard(
      supabase.rpc('media_submission_photos_list', { p_submission_id: submissionId }),
    )) ?? []) as unknown as MediaSubmissionPhoto[]
  },

  async updateSubmission(
    id: string,
    data: { title: string; workType: string | null; eventDate: string | null; notes: string },
  ): Promise<MediaSubmission> {
    return (await sdkGuard(
      supabase.rpc('media_submission_update', {
        p_id: id,
        p_title: data.title,
        p_work_type: data.workType || null,
        p_event_date: data.eventDate || null,
        p_notes: data.notes || null,
      }),
    )) as unknown as MediaSubmission
  },

  async updatePhotoCaption(photoId: string, caption: string): Promise<MediaSubmissionPhoto> {
    return (await sdkGuard(
      supabase.rpc('media_photo_update', { p_photo_id: photoId, p_caption: caption }),
    )) as unknown as MediaSubmissionPhoto
  },

  async archiveSubmission(id: string, reason: string): Promise<MediaSubmission> {
    return (await sdkGuard(
      supabase.rpc('media_submission_archive', { p_id: id, p_reason: reason || null }),
    )) as unknown as MediaSubmission
  },

  /** رفع دفعة صور إلى الحاوية (بمسار يبدأ بمعرف المستخدم) */
  async uploadPhotos(files: File[]): Promise<string[]> {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id ?? 'anon'
    const stamp = Date.now()
    const paths: string[] = []
    const concurrency = 6
    let index = 0
    const worker = async (): Promise<void> => {
      while (index < files.length) {
        const i = index++
        const file = files[i]
        if (!file) continue
        const safe = (file.name || `photo-${i + 1}`).replace(/[^\\w.-]+/g, '_')
        const path = `${uid}/${stamp}-${i + 1}-${safe}`
        const up = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        })
        if (up.error) throw new Error(up.error.message)
        paths[i] = path
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))
    return paths
  },

  /** روابط مؤقتة دفعة واحدة (حتى 500 صورة) */
  async signedUrls(paths: string[]): Promise<Record<string, string>> {
    if (!paths.length) return {}
    const res = await sdkGuard(
      supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60),
    )
    const map: Record<string, string> = {}
    ;(res ?? []).forEach((item) => {
      if (item && item.signedUrl && item.path) map[item.path] = item.signedUrl
    })
    return map
  },

  /* ── التصاميم ── */
  async createDesign(
    sectorParent: string,
    periodType: string,
    title: string,
    coverPath: string | null,
    photos: Array<{ photoId: string; workType: string; caption: string }>,
  ): Promise<MediaDesign> {
    return (await sdkGuard(
      supabase.rpc('media_design_create', {
        p_sector_parent: sectorParent,
        p_period_type: periodType,
        p_title: title,
        p_cover_path: coverPath || null,
        p_photos: photos.map((p) => ({
          photo_id: p.photoId,
          work_type: p.workType,
          caption: p.caption,
        })),
      }),
    )) as unknown as MediaDesign
  },

  async listDesigns(sectorParent: string | null = null): Promise<MediaDesign[]> {
    return ((await sdkGuard(
      supabase.rpc('media_designs_list', { p_sector_parent: sectorParent }),
    )) ?? []) as unknown as MediaDesign[]
  },

  async designDetail(id: string): Promise<MediaDesignDetail> {
    const [rows, sheets] = await Promise.all([
      sdkGuard(supabase.rpc('media_design_detail', { p_id: id })),
      sdkGuard(supabase.rpc('media_design_sheets_list', { p_id: id })),
    ])
    const list = (rows ?? []) as unknown as Array<Record<string, unknown>>
    const first = list[0]
    if (!first) throw new Error('MEDIA_DESIGN_EMPTY')
    return {
      design: (first.design ?? {}) as MediaDesign,
      sheets: ((sheets ?? []) as unknown as Array<Record<string, unknown>>).map((s) => ({
        work_type: String(s.work_type ?? ''),
        sheet_text: String(s.sheet_text ?? ''),
      })),
      photos: list.map((r) => ({
        photo_id: String(r.photo_id ?? ''),
        source_photo_id: (r.source_photo_id as string) ?? null,
        source_submission_id: (r.source_submission_id as string) ?? null,
        work_type: String(r.work_type ?? ''),
        storage_path: String(r.storage_path ?? ''),
        caption: (r.caption as string) ?? null,
        report_caption: (r.report_caption as string) ?? null,
        display_fit: ((r.display_fit as string) ?? 'contain') as 'contain' | 'cover',
        display_zoom: Number(r.display_zoom ?? 1),
        sort_order: Number(r.sort_order ?? 0),
      })),
    }
  },

  async saveDesignReport(
    id: string,
    sheets: Array<{ workType: string; text: string }>,
    captions: Array<{
      rowId: string
      text: string
      fit?: 'contain' | 'cover'
      zoom?: number
    }>,
    extra?: { summary?: unknown; colors?: unknown },
  ): Promise<void> {
    await sdkGuard(
      supabase.rpc('media_design_report_save', {
        p_id: id,
        p_sheets: sheets.map((s) => ({ work_type: s.workType, text: s.text })),
        p_captions: captions.map((c) => ({
          row_id: c.rowId,
          text: c.text,
          fit: c.fit ?? null,
          zoom: c.zoom != null ? String(c.zoom) : null,
        })),
        p_summary: extra?.summary ?? null,
        p_colors: extra?.colors ?? null,
      }),
    )
  },

  async reorderDesignPhotos(
    id: string,
    items: Array<{ rowId: string; workType: string; sortOrder: number }>,
  ): Promise<void> {
    await sdkGuard(
      supabase.rpc('media_design_photos_reorder', {
        p_id: id,
        p_items: items.map((i) => ({
          row_id: i.rowId,
          work_type: i.workType,
          sort_order: i.sortOrder,
        })),
      }),
    )
  },

  async updateDesign(
    id: string,
    data: { title: string; periodType: string; coverPath: string | null },
  ): Promise<MediaDesign> {
    return (await sdkGuard(
      supabase.rpc('media_design_update', {
        p_id: id,
        p_title: data.title,
        p_period_type: data.periodType,
        p_cover_path: data.coverPath || null,
      }),
    )) as unknown as MediaDesign
  },

  async addDesignPhotos(
    id: string,
    photos: Array<{ photoId: string; workType: string; caption: string }>,
  ): Promise<MediaDesign> {
    return (await sdkGuard(
      supabase.rpc('media_design_add_photos', {
        p_id: id,
        p_photos: photos.map((p) => ({
          photo_id: p.photoId,
          work_type: p.workType,
          caption: p.caption,
        })),
      }),
    )) as unknown as MediaDesign
  },

  async removeDesignPhoto(photoRowId: string): Promise<number> {
    return (await sdkGuard(
      supabase.rpc('media_design_photo_remove', { p_photo_row_id: photoRowId }),
    )) as unknown as number
  },

  async completeDesign(id: string): Promise<MediaDesign> {
    return (await sdkGuard(
      supabase.rpc('media_design_complete', { p_id: id }),
    )) as unknown as MediaDesign
  },

  async deleteDesign(id: string): Promise<void> {
    await sdkGuard(supabase.rpc('media_design_delete', { p_id: id }))
  },

  /* ── قوالب التصميم (الهوية البصرية) ── */
  async listTemplates(includeArchived = false): Promise<MediaDesignTemplate[]> {
    return ((await sdkGuard(
      supabase.rpc('media_templates_list', { p_include_archived: includeArchived }),
    )) ?? []) as unknown as MediaDesignTemplate[]
  },

  async createTemplate(args: {
    title: string
    sectorParent: string | null
    periodType: string
    coverPath: string | null
    workTypes: string[]
    notes: string
  }): Promise<MediaDesignTemplate> {
    return (await sdkGuard(
      supabase.rpc('media_template_create', {
        p_title: args.title,
        p_sector_parent: args.sectorParent,
        p_period_type: args.periodType,
        p_cover_path: args.coverPath,
        p_work_types: args.workTypes,
        p_notes: args.notes,
      }),
    )) as unknown as MediaDesignTemplate
  },

  async updateTemplate(
    id: string,
    args: {
      title: string
      sectorParent: string | null
      periodType: string
      coverPath: string | null
      workTypes: string[]
      notes: string
    },
  ): Promise<MediaDesignTemplate> {
    return (await sdkGuard(
      supabase.rpc('media_template_update', {
        p_id: id,
        p_title: args.title,
        p_sector_parent: args.sectorParent,
        p_period_type: args.periodType,
        p_cover_path: args.coverPath,
        p_work_types: args.workTypes,
        p_notes: args.notes,
      }),
    )) as unknown as MediaDesignTemplate
  },

  async archiveTemplate(id: string): Promise<MediaDesignTemplate> {
    return (await sdkGuard(
      supabase.rpc('media_template_archive', { p_id: id }),
    )) as unknown as MediaDesignTemplate
  },

  /** رفع غلاف التصميم (مسار media-officer/…) */
  async uploadCover(file: File): Promise<string> {
    const stamp = Date.now()
    const safe = file.name.replace(/[^\\w.-]+/g, '_')
    const path = `media-officer/cover-${stamp}-${safe}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
    if (up.error) throw new Error(up.error.message)
    return path
  },
}
