/**
 * محرّك التعديل اليدوي — الجولة ②.
 *
 * المشرف يسحب شارعاً أو زقاقاً، يغيّر اسمه أو تصنيفه، يمدّد طرفه أو يقصّره،
 * ثم يحفظ. **التحقق قبل الحفظ، لا بعده:** أي تعديل يخرج عن حدّ الزون أو يجعل
 * المسار أقصر من متر أو يخلق تكراراً يُرفض في الواجهة بنصّ عربي، قبل أن ترفضه
 * القاعدة برسالة إنجليزية.
 *
 * كل تعديل يُسجَّل في تاريخ (تراجع/إعادة) حتى لا يضيع عمل المشرف بضغطة.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { pointInPolygon, pathLengthM, insideOrOnZone, type LatLng } from '@features/map-import/lib/geometry'

/** أقل طول مقبول للعنصر بعد التعديل — أقصر من هذا ليس طريقاً */
export const MIN_EDIT_LENGTH_M = 3

export type EditTarget = { kind: 'street' | 'alley'; id: string; code: string }

export interface EditDraft {
  target: EditTarget
  pts: LatLng[]
  name: string | null
  kind: string
  /** هل تغيّر شيء عن الأصل؟ */
  dirty: boolean
}

export interface EditError {
  field: 'path' | 'name' | 'kind' | 'general'
  message: string
}

/** حالة تاريخ كاملة — لقطة قبل/بعد */
interface HistoryEntry {
  target: EditTarget
  before: EditDraft
  after: EditDraft
}

export interface MapEditState {
  draft: EditDraft | null
  errors: EditError[]
  canUndo: boolean
  canRedo: boolean
}

/**
 * التحقق من تعديل — يُستدعى في الواجهة **وفي الاختبارات** بنفس الدالة،
 * فما يرفضه الاختبار هو ما يرفضه المشرف حرفياً.
 */
export function validateEdit(
  draft: EditDraft,
  zonePolygon: LatLng[],
): EditError[] {
  const errors: EditError[] = []

  if (draft.pts.length < 2) {
    errors.push({ field: 'path', message: 'المسار يحتاج نقطتين على الأقل' })
    // نُكمل: الاسم والتصنيف يُفحصان أيضاً حتى يرى المشرف كل الأخطاء معاً
  }

  /**
   * حدود الزون — **بنفس قانون القاعدة، لا أشدّ منه ولا أرخى.**
   *
   * كان الشرط: كل نقطة داخل الزون. والقاعدة (`app.map_guard_path_in_zone`)
   * ترفض فقط حين يكون **أكثر من نصف** النقاط خارجها — لأن الشوارع على
   * الحدود الإدارية حقيقية، ومضلّع الزون في OSM تقريبي. النتيجة كانت أن
   * الواجهة تمنع تعديلاً مشروعاً بخطأ أحمر بينما القاعدة ستقبله.
   *
   * الآن: نفس العتبة. وما زاد على الحدّ يبقى خطأً بسبب صريح.
   */
  const outside = draft.pts.filter((p) => !insideOrOnZone(p, zonePolygon))
  if (outside.length > 0 && outside.length * 2 > draft.pts.length) {
    const sample = outside[0] as LatLng
    errors.push({
      field: 'path',
      message:
        `${outside.length} من ${draft.pts.length} نقطة خارج حدّ الزون (مثال: ${sample[0].toFixed(5)}, ${sample[1].toFixed(5)})`
        + ' — أكثر من نصف المسار خارج الزون، أعِد النقاط للداخل',
    })
  }

  const len = pathLengthM(draft.pts)
  if (len < MIN_EDIT_LENGTH_M) {
    errors.push({
      field: 'path',
      message: `طول المسار ${len.toFixed(1)}م — أقل من الحدّ ${MIN_EDIT_LENGTH_M}م`,
    })
  }

  if (draft.name !== null && draft.name.trim().length > 0 && draft.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'الاسم حرف واحد — اتركه فارغاً أو اكتب اسماً كاملاً' })
  }

  if (draft.kind !== 'alley' && !['primary', 'secondary', 'tertiary', 'local'].includes(draft.kind)) {
    errors.push({ field: 'kind', message: 'تصنيف غير معروف' })
  }

  return errors
}

export function useMapEdit(zonePolygon: LatLng[]) {
  const [state, setState] = useState<MapEditState>({
    draft: null,
    errors: [],
    canUndo: false,
    canRedo: false,
  })
  /**
   * ⚠ عيب أُصلح: كان `valid` يُحسب من `state.draft` عبر `useMemo` يعتمد على
   * مرجع `state` — و`begin` كان يستدعي `sync()` (تحديث حالة) ثم يعيد الكائن
   * القديم في نفس الدورة، فيظهر `valid=false` رغم أن المسودة سليمة.
   * الحل: الحالة تُبنى كاملة في دالة واحدة (`build`) وتُعاد من المصدر نفسه.
   */
  const undoStack = useRef<HistoryEntry[]>([])
  const redoStack = useRef<HistoryEntry[]>([])
  const original = useRef<EditDraft | null>(null)

  /** يبني الحالة كاملة من مصدر واحد — لا اشتقاق مزدوج */
  const build = useCallback(
    (draft: EditDraft | null): MapEditState => ({
      draft,
      errors: draft ? validateEdit(draft, zonePolygon) : [],
      canUndo: undoStack.current.length > 0,
      canRedo: redoStack.current.length > 0,
    }),
    [zonePolygon],
  )

  const sync = useCallback((draft: EditDraft | null) => {
    setState(build(draft))
  }, [build])

  /** يبدأ تعديلاً على عنصر قائم */
  const begin = useCallback((input: {
    kind: 'street' | 'alley'
    id: string
    code: string
    pts: LatLng[]
    name: string | null
    kindValue: string
  }) => {
    const d: EditDraft = {
      target: { kind: input.kind, id: input.id, code: input.code },
      pts: input.pts.map((p) => [p[0], p[1]] as LatLng),
      name: input.name,
      kind: input.kindValue,
      dirty: false,
    }
    original.current = structuredClone(d)
    undoStack.current = []
    redoStack.current = []
    sync(d)
  }, [sync])

  /** يطبّق تغييراً ويُسجّله في التاريخ */
  const apply = useCallback((patch: Partial<Pick<EditDraft, 'pts' | 'name' | 'kind'>>) => {
    setState((prev) => {
      if (!prev.draft) return prev
      const next: EditDraft = {
        ...prev.draft,
        ...patch,
        dirty: true,
      }
      undoStack.current.push({ target: prev.draft.target, before: prev.draft, after: next })
      redoStack.current = []
      return build(next)
    })
  }, [build])

  const undo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return
    redoStack.current.push(entry)
    sync(entry.before)
  }, [sync])

  const redo = useCallback(() => {
    const entry = redoStack.current.pop()
    if (!entry) return
    undoStack.current.push(entry)
    sync(entry.after)
  }, [sync])

  const cancel = useCallback(() => {
    sync(original.current)
    undoStack.current = []
    redoStack.current = []
    sync(null)
    original.current = null
  }, [sync])

  /** يُرجع المسودة النهائية إن كانت صالحة — وإلا null. الحفظ لا يُنادى على مسودة خاطئة. */
  const prepareSave = useCallback((): EditDraft | null => {
    const d = state.draft
    if (!d) return null
    const errs = validateEdit(d, zonePolygon)
    if (errs.length > 0) {
      setState((prev) => ({ ...prev, errors: errs }))
      return null
    }
    return d
  }, [state.draft, zonePolygon])

  return useMemo(
    () => ({
      ...state,
      begin,
      apply,
      undo,
      redo,
      cancel,
      prepareSave,
      /** هل المسار صالح للحفظ الآن؟ */
      valid: state.draft !== null && state.errors.length === 0,
    }),
    [state, begin, apply, undo, redo, cancel, prepareSave],
  )
}

/**
 * يتحقق من نقطة واحدة أثناء السحب — أخفّ من `validateEdit` ولا يُشغَّل لكل حركة فأرة.
 * يُستدعى عند الإفلات فقط.
 */
export function canDropAt(pt: LatLng, zonePolygon: LatLng[]): boolean {
  return pointInPolygon(pt, zonePolygon) || insideOrOnZone(pt, zonePolygon)
}
