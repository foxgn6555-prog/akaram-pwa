/**
 * قارئ OSM XML تدفّقي — لا يحمّل الملف كاملاً في الذاكرة.
 *
 * **لماذا تدفّقي:** تحليل ١٠٠ ميجابايت بـ`DOMParser` يتطلب بناء شجرة كاملة في
 * الذاكرة (×٥–×١٠ من حجم الملف) فيتجمد التبويب أو ينفجر. هنا نقرأ قطعةً قطعة،
 * ونبقي **العُقد** فقط (٨ بايت للزوج في Float64Array)، ونمرّر كل `<way>` عند
 * إغلاقه. فاستهلاك الذاكرة يتناسب مع **عدد العُقد** لا مع حجم الملف.
 *
 * **أرضية المستهلك:** الخريطة تُقرأ `Map<id, [lat,lng]>` — وهذا يبقى الحجم
 * الحقيقي. حيّ بكثافة بغداد ≈ ٥٠–٢٠٠ ألف عقدة (٣–١٢ ميجابايت)، وهي مقبولة.
 *
 * **لماذا لا مكتبة XML:** `DOMParser` تحليليّ لكنه يبني الشجرة (وهو المرفوض)،
 * ومكتبات sax في npm تُضيف تبعيةً لـ٢٠٠ سطر نكتبها ونختبرها بأنفسنا.
 */

import { ROUTE_HIGHWAY_TAGS } from './classify'

export interface OsmWay {
  id: number
  /** مراجع العُقد بالترتيب */
  nodes: number[]
  tags: Record<string, string>
}

export interface OsmParseStats {
  /** عدد العُقد المقروءة (كل الملف — لا المطلوبة فقط) */
  nodesRead: number
  waysRead: number
  /** أشواط ذات وسم highway مقبول (مرشّحة للاستيراد) */
  routeWays: number
  /** أشواط سُقطت لأن وسمها غير مقبول (طريق سريع، سكة… إلخ) */
  waysSkippedNoHighway: number
  bytesRead: number
  /** أقصى طول وسم name شوهد — لفحص الترميز */
  maxNameLength: number
}

export interface ParseOptions {
  /** تُسترجع العقدة الآن؟ (بلا فهرس = كل العُقد) */
  onNode?: (id: number, lat: number, lng: number) => void
  /** يُستدعى لكل `<way>` ذي وسم highway مقبول */
  onWay: (way: OsmWay) => void
  /** عند تجاوز حجم معين — يوقف القراءة ويعيد `truncated` */
  maxBytes?: number
  signal?: AbortSignal
}

const ROUTE_SET = new Set(ROUTE_HIGHWAY_TAGS)

/** يفكّ كيانات XML الأساسية في النصوص العربية (أسماء الشوارع) */
export function decodeXmlEntities(s: string): string {
  if (s.indexOf('&') === -1) return s
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
}

/** يقرأ قيمة سمة من وسم خام — بلا regex لكل الملف، بل بحث مباشر أسرع */
function attr(tag: string, name: string): string | undefined {
  const needle = ` ${name}="`
  const i = tag.indexOf(needle)
  if (i === -1) return undefined
  const start = i + needle.length
  const end = tag.indexOf('"', start)
  return end === -1 ? undefined : tag.slice(start, end)
}

/**
 * يحلّل تدفّق نص OSM XML.
 * يُرجع إحصاءات القراءة؛ الأثر الجانبي عبر `onNode` / `onWay`.
 */
export async function parseOsmStream(
  stream: ReadableStream<Uint8Array>,
  opts: ParseOptions,
): Promise<{ stats: OsmParseStats; truncated: boolean }> {
  const stats: OsmParseStats = {
    nodesRead: 0,
    waysRead: 0,
    routeWays: 0,
    waysSkippedNoHighway: 0,
    bytesRead: 0,
    maxNameLength: 0,
  }
  let truncated = false

  const reader = stream.getReader()
  const decoder = new TextDecoder('utf-8')
  /** بقية لم تُعالَج من القطعة السابقة (وسم مقطوع) */
  let carry = ''

  /** حالة الشوط الجاري */
  let curWay: { id: number; nodes: number[]; tags: Record<string, string> } | null = null

  const emitWay = (): void => {
    if (!curWay) return
    stats.waysRead++
    const hw = curWay.tags.highway
    if (hw && ROUTE_SET.has(hw)) {
      stats.routeWays++
      const nm = curWay.tags.name
      if (nm && nm.length > stats.maxNameLength) stats.maxNameLength = nm.length
      opts.onWay({ id: curWay.id, nodes: curWay.nodes, tags: curWay.tags })
    } else {
      stats.waysSkippedNoHighway++
    }
    curWay = null
  }

  /** يعالج قطعة نصية كاملة (تسبقها بقية غير مكتملة) */
  const process = (chunk: string): void => {
    const s = carry + chunk

    // نقطة القطع: آخر '<' مفتوحة لا تُغلق في هذه القطعة
    const lastOpen = s.lastIndexOf('<')
    const lastClose = s.lastIndexOf('>')
    let body = s
    if (lastOpen > lastClose) {
      carry = s.slice(lastOpen)
      body = s.slice(0, lastOpen)
    } else {
      carry = ''
    }

    let i = 0
    const len = body.length
    while (i < len) {
      const lt = body.indexOf('<', i)
      if (lt === -1) break
      const gt = body.indexOf('>', lt)
      if (gt === -1) break
      const tag = body.slice(lt + 1, gt)
      i = gt + 1

      // تعليقات وأقسام XML
      if (tag.startsWith('!--') || tag.startsWith('?') || tag.startsWith('!')) continue

      const selfClose = tag.endsWith('/')
      const raw = selfClose ? tag.slice(0, -1) : tag
      const sp = raw.search(/\s/)
      const name = sp === -1 ? raw : raw.slice(0, sp)

      if (name === 'node') {
        const id = attr(raw, 'id')
        const lat = attr(raw, 'lat')
        const lng = attr(raw, 'lon')
        if (id !== undefined && lat !== undefined && lng !== undefined) {
          const nid = Number(id)
          const nlat = Number(lat)
          const nlng = Number(lng)
          if (Number.isFinite(nid) && Number.isFinite(nlat) && Number.isFinite(nlng)) {
            stats.nodesRead++
            opts.onNode?.(nid, nlat, nlng)
          }
        }
      } else if (name === 'way') {
        emitWay()
        const id = attr(raw, 'id')
        if (id !== undefined) curWay = { id: Number(id), nodes: [], tags: {} }
      } else if (name === 'nd' && curWay) {
        const ref = attr(raw, 'ref')
        if (ref !== undefined) curWay.nodes.push(Number(ref))
      } else if (name === 'tag' && curWay) {
        const k = attr(raw, 'k')
        const v = attr(raw, 'v')
        if (k !== undefined && v !== undefined) curWay.tags[k] = decodeXmlEntities(v)
      } else if (name === '/way') {
        emitWay()
      }
    }
  }

  try {
    for (;;) {
      if (opts.signal?.aborted) throw new DOMException('أُلغيت القراءة', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      stats.bytesRead += value.byteLength
      if (opts.maxBytes !== undefined && stats.bytesRead > opts.maxBytes) {
        truncated = true
        break
      }
      process(decoder.decode(value, { stream: true }))
    }
    if (!truncated) process(decoder.decode())
    if (!truncated) emitWay()
  } finally {
    // الإلغاء يجب أن يوقف القارئ فعلاً، وإلا استمرّ التنزيل في الخلفية
    try {
      await reader.cancel()
    } catch {
      /* لا شيء — القراءة انتهت */
    }
  }

  return { stats, truncated }
}

/** مساعد للاختبارات وNode: يغلّف نصاً كتدفّق */
export function textToStream(text: string, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}
