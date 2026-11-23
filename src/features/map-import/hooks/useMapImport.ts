/**
 * خطاف الاستيراد — ينسّق: قراءة الملف تدفّقياً ⇒ تجميع ومعاينة ⇒ إدراج على دفعات.
 *
 * **قيد الخصوصية (قرار مثبَّت):** الملف لا يُرسَل للخادم. `File.stream()` يُقرأ في المتصفح،
 * والعُقد تُحفظ في `Map` محلياً، ثم تُدمَّر بعد التجميع. ما يُرسل هو الصفوف المصنَّفة فقط.
 *
 * **قيد الذاكرة (١٠٠+ م.ب):** لا نقرأ النص كاملاً. `parseOsmStream` يعمل على قارئ تدفّقي،
 * ولا نحتفظ إلا بالعُقد التي يشير إليها شوط `highway` — البقية تُهمَل فوراً.
 */
import { useCallback, useRef, useState } from 'react'
import {
  assembleImport,
  type ImportPreview,
} from '@features/map-import/lib/assemble'
import {
  parseOsmStream,
  type OsmParseStats,
  type OsmWay,
} from '@features/map-import/lib/osm-stream'
import { polygonAreaM2, type LatLng } from '@features/map-import/lib/geometry'
import { mapImportSdk, type ImportBatchResult } from '@sdk/map-import.sdk'

export type ImportPhase =
  | { kind: 'idle' }
  | { kind: 'parsing'; bytesRead: number; totalBytes: number; nodes: number; ways: number }
  | { kind: 'preview'; preview: ImportPreview; parse: OsmParseStats; fileName: string; ms: number }
  | { kind: 'inserting'; done: number; total: number; result: ImportBatchResult }
  | { kind: 'done'; preview: ImportPreview; result: ImportBatchResult }
  | { kind: 'error'; message: string }

/** رقم إصدار الكود — يمنع تضاعف ترقيم `STR-0001` عند كل استيراد لزون مختلف */
export interface InsertOptions {
  /** حجم الدفعة: ١٠٠ أو ٢٠٠. الافتراضي ٢٠٠ من القياس */
  batchSize?: number
  /**
   * اسم الملف كما اختاره المشغّل — يُحفظ في `map_import_batches.file_name`.
   *
   * **العيب الذي يُصلحه:** كان يُرسَل `file: { name: <عدد> }` — والمفتاح
   * `file` لا `file_name` (يقرأه SQL من `p_meta->>'file_name'`)، والقيمة
   * **عدد الصفوف** لا اسم الملف. فأثر مزدوج: العمود يبقى `null` دائماً،
   * ولو قُرئ لكان رقم `297` مكان `export.osm`. سجل الدفعات بلا اسم الملف
   * لا يصلح للتتبّع — وهو الغرض المعلن للعمود في المهاجرة الأصلية
   * («اسم الملف كما اختاره المشرف — للتتبّع لا للمعالجة»).
   */
  fileName?: string
  /** حجم الملف بالبايت — يُحفظ في `map_import_batches.file_bytes` */
  fileBytes?: number
  /** يُستدعى بعد كل دفعة لإظهار التقدّم */
  onProgress?: (done: number, total: number, partial: ImportBatchResult) => void
}

export function useMapImport() {
  const [phase, setPhase] = useState<ImportPhase>({ kind: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  /** يُلغي عملية جارية — القراءة أو الإدراج */
  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  /**
   * يقرأ ملف .osm/.xml تدفّقياً ويُجمّع المعاينة. لا يكتب على الخادم إطلاقاً.
   * @param file ملف OSM المختار
   * @param zonePolygon مضلّع الزون [lat,lng] من `app.map_zone_polygon`
   */
  const analyze = useCallback(
    async (
      file: File,
      zonePolygon: LatLng[],
      opts?: { includeLinks?: boolean },
    ): Promise<ImportPreview | null> => {
      cancel()
      const ac = new AbortController()
      abortRef.current = ac
      const started = Date.now()

      if (!zonePolygon || zonePolygon.length < 3) {
        setPhase({ kind: 'error', message: 'مضلّع الزون غير صالح — ارسم حدود الزون أولاً' })
        return null
      }

      setPhase({
        kind: 'parsing',
        bytesRead: 0,
        totalBytes: file.size,
        nodes: 0,
        ways: 0,
      })

      try {
        const nodes = new Map<number, LatLng>()
        const ways: OsmWay[] = []

        const parse = await parseOsmStream(file.stream(), {
          signal: ac.signal,
          onNode: (id, lat, lng) => nodes.set(id, [lat, lng]),
          onWay: (way) => ways.push(way),
        })

        if (ac.signal.aborted) return null

        // التجميع لا يحتاج العُقد كلها — لكننا نبقيها للتجميع كاملاً ثم نُحرّرها
        const preview = assembleImport({
          ways,
          lookupNode: (ref) => nodes.get(ref),
          zonePolygon,
          // روابط الطرق: عرض فقط، لا تُستورد (تُفلتر في sendBatch)
          opts: { includeLinks: opts?.includeLinks },
        })
        nodes.clear()
        ways.length = 0

        if (ac.signal.aborted) return null

        setPhase({
          kind: 'preview',
          preview,
          parse: parse.stats,
          fileName: file.name,
          ms: Date.now() - started,
        })
        return preview
      } catch (err) {
        if (ac.signal.aborted) return null
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'فشل قراءة الملف',
        })
        return null
      }
    },
    [cancel],
  )

  /**
   * يُدرج المعاينة على دفعات. آمن للتكرار: `on conflict (zone_id, code) do update`
   * في القاعدة، والاسم اليدوي لا يُطغى.
   */
  const insert = useCallback(
    async (
      zoneId: string,
      preview: ImportPreview,
      opts: InsertOptions = {},
    ): Promise<ImportBatchResult | null> => {
      const ac = new AbortController()
      abortRef.current = ac
      /*
       * ══ حجم الدفعة: ٣٠٠ (سقف الخادم) — بعد إصلاح O(n²) في الجولة ⑬ ══
       *
       * ## التاريخ (لا أُعيد كتابته — يُقرأ كحلٍّ متدرّج)
       *
       * الجولة ⑪ وجدت الإدراج تربيعياً:
       *
       *   25 صف  =>   634,722 us      50 صف  => 2,365,177 us
       *   75 صف  => ~5,300,000 us    100 صف  => ~9,500,000 us
       *
       * فخُفِّضت الدفعة إلى ٥٠ **تخفيفاً** لا إصلاحاً. وقياس آخر أكّد أن
       * التخفيف لا يكفي: ٤ × ٥٠ = ٢٠٠ صف استغرقت ١٣.٣٨ ثانية، لأن
       * الصفوف تتراكم في الزون فيصير كل صف أحدث أثقل من سابقه.
       *
       * ## الجولة ⑬ — الجذر أُصلح
       *
       * السبب كان `app.map_overlap_check` تنادي `map_nearby_streets` بـ
       * هامش ٦٠٠ متر الافتراضي ⇒ **٤٢٠ مرشّحاً لكل صف** في زون ٤٥٠ صفاً.
       * والفحصان الباقيان يحتاجان ١.٥م فقط (تداخل) و٠.٥م (تقاطع).
       * بالهامش ٥م صار المرشّحون **٢**:
       *
       *   import 100 صف =>   582,073 us   (كان 9,500,000 — 16.3×)
       *   import 450 صف => 3,087,994 us   (كان ~190,000,000 — ~62×)
       *
       * والزمن لكل صف **انخفض** عند زيادة العدد (٥.٨ ⇒ ٦.٩ us) ⇒ خطّي.
       *
       * ## فلماذا ٣٠٠ الآن؟
       *
       * ٣٠٠ هو سقف `app.map_import_limits().batch_cap` على الخادم.
       * الإرسال الأكبر = طلبات أقل (450 صفاً: ٢ طلبات بدل ٩) وتقدّم أسرع.
       *
       * ⚠ ٣٠٠ × ٦.٩ us ≈ ٢ ثانية — مريح تحت سقف ١١٠ ثانية. ونسبةً إلى
       * السقف القديم ٨ ثوانٍ: كان هذا الحجم مستحيلاً قبل ⑪.
       */
      const batchSize = opts.batchSize ?? 300
      const total = preview.rows.length
      const batchId = crypto.randomUUID()

      // المحلات أولاً — الأزقة تُربط بها في نفس الدفعة
      const mahallas = Object.values(preview.mahallas).map((m) => ({
        code: m.code,
        osm_number: m.osmNumber,
        name: m.name,
      }))

      const area = polygonAreaM2(preview.zonePolygon) / 1e6
      /*
       * المفاتيح هنا يجب أن تطابق ما يقرأه `app.map_import_batch`:
       *   `p_meta->>'file_name'` و `p_meta->>'file_bytes'`
       * (راجع الهجرة 20261122001300 سطر ٢٢٠). المفتاح `file` والاسم
       * الرقمي كانا خطأً صامتاً: لا خطأ، لكن العمود يبقى فارغاً للأبد.
       */
      const meta = {
        file_name: opts.fileName ?? null,
        file_bytes: opts.fileBytes ?? null,
        area_km2: area,
        density: preview.stats.density,
        density_reference: 21.3,
        source: 'browser-stream',
        total_rows: total,
      }

      const acc: ImportBatchResult = {
        batch_id: batchId,
        inserted: 0,
        updated: 0,
        skipped: 0,
        errors: [],
      }
      let done = 0

      setPhase({ kind: 'inserting', done: 0, total, result: acc })

      /*
       * ══ الجولة ⑪: دفعة فاشلة لا تُسقط الاستيراد ══
       *
       * كان: `await sendBatch(…)` بلا حماية ⇒ أول فشل (مهلة ٨ ثوانٍ، أو
       * شبكة، أو رفض) يرمي استثناءً يُخرج من الحلقة كلها. الأثر المقيس:
       * ٣ دفعات، تفشل الثانية ⇒ تبقى الأولى فقط، والرسالة «فشل الإدراج»
       * بلا ذكر للتي نجحت ولا لعددها.
       *
       * صار: كل دفعة داخل try مستقلة. الفاشلة تُسجَّل في `failedBatches`
       * بمداها وسببها، ويُكمَل الباقي. النتيجة النهائية تعرض ما نجح وما فشل
       * معاً — والمشغّل يرى «أُدرج ٤٠٠ من ٦٠٠: الدفعة ٢٠١–٤٠٠ فشلت: timeout».
       *
       * ⚠ لا نُعيد المحاولة تلقائياً: المهلة تعني أن القاعدة **عملت** ثم
       * أُلغي، فإعادة المحاولة قد تُضاعف العمل بلا فائدة. المشغّل يعيد
       * الإدراج بضغطة (وهو آمن: المطابقة بـ`(osm_way_id, piece_index)`).
       */
      const failedBatches: { from: number; to: number; error: string }[] = []

      for (let i = 0; i < total; i += batchSize) {
        if (ac.signal.aborted) return null
        const rows = preview.rows.slice(i, i + batchSize)
        const from = i + 1
        const to = Math.min(i + batchSize, total)
        try {
          const res = await mapImportSdk.sendBatch({
            zoneId,
            rows,
            // المحلات تُرسل مع الدفعة الأولى فقط (أو مع كل دفعة — الدالة idempotent)
            mahallas: i === 0 ? mahallas : [],
            batchId,
            meta: i === 0 ? meta : {},
          })
          acc.inserted += res.inserted
          acc.updated += res.updated
          acc.skipped += res.skipped
          acc.errors.push(...res.errors)
        } catch (err) {
          if (ac.signal.aborted) return null
          const message = err instanceof Error ? err.message : 'فشل غير معروف'
          failedBatches.push({ from, to, error: message })
        }
        done = to
        setPhase({
          kind: 'inserting',
          done,
          total,
          result: { ...acc, failedBatches: [...failedBatches] },
        })
        opts.onProgress?.(done, total, { ...acc, failedBatches: [...failedBatches] })
      }

      const final: ImportBatchResult = { ...acc, failedBatches }

      if (failedBatches.length === total / batchSize && total > 0) {
        /*
         * كل الدفعات فشلت ⇒ هذه حالة خطأ حقيقية لا «نجاح جزئي صفري».
         * نُظهر السبب الأول (الأغلب الجذر نفسه) ونُبقي القائمة كاملة.
         */
        setPhase({
          kind: 'error',
          message:
            failedBatches[0]?.error ??
            'فشلت كل الدفعات — تحقّق من الصلاحية أو حجم الملف',
        })
        return null
      }

      setPhase({ kind: 'done', preview, result: final })
      return final
    },
    [],
  )

  const reset = useCallback(() => {
    cancel()
    setPhase({ kind: 'idle' })
  }, [cancel])

  return { phase, analyze, insert, cancel, reset }
}
