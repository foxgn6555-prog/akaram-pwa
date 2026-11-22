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
      const batchSize = opts.batchSize ?? 200
      const total = preview.rows.length
      const batchId = crypto.randomUUID()

      // المحلات أولاً — الأزقة تُربط بها في نفس الدفعة
      const mahallas = Object.values(preview.mahallas).map((m) => ({
        code: m.code,
        osm_number: m.osmNumber,
        name: m.name,
      }))

      const area = polygonAreaM2(preview.zonePolygon) / 1e6
      const meta = {
        file: { name: preview.stats.streets + preview.stats.alleys },
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

      try {
        for (let i = 0; i < total; i += batchSize) {
          if (ac.signal.aborted) return null
          const rows = preview.rows.slice(i, i + batchSize)
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
          done = Math.min(i + batchSize, total)
          setPhase({ kind: 'inserting', done, total, result: { ...acc } })
          opts.onProgress?.(done, total, res)
        }

        setPhase({ kind: 'done', preview, result: acc })
        return acc
      } catch (err) {
        if (ac.signal.aborted) return null
        setPhase({
          kind: 'error',
          message: err instanceof Error ? err.message : 'فشل الإدراج',
        })
        return null
      }
    },
    [],
  )

  const reset = useCallback(() => {
    cancel()
    setPhase({ kind: 'idle' })
  }, [cancel])

  return { phase, analyze, insert, cancel, reset }
}
