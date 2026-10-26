/** 00349 (الجولة A): عقد «زر الإرسال يُعطَّل أثناء التنفيذ» — كل زر يستدعي mutate/mutateAsync مباشرة في onClick
 *  يجب أن يحمل disabled/isPending/isLoading/loading، كي لا تُرسَل العملية مرتين بنقرتين متتاليتين.
 *  (الحارس النهائي في قاعدة البيانات — app.guard_duplicate — لكن الواجهة يجب ألا تسمح بذلك أصلاً.) */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), 'src')
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))

/** يجمع كل وسم زر (قد يمتد على عدة أسطر) من فتحه حتى `>` الإغلاق الأول. */
function buttonTags(src: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = []
  const re = /<(?:button|Button|HeaderButton|IconButton|ActionButton)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let depth = 0
    let i = m.index
    for (; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    out.push({ tag: src.slice(m.index, i + 1), line: src.slice(0, m.index).split('\n').length })
  }
  return out
}

const PROTECTED = /\bdisabled\b|isPending|isLoading|\bloading\b|\bbusy\b|\bsubmitting\b/
const CALLS_MUTATION = /\.mutate(?:Async)?\(/

export function unprotectedMutationButtons(): string[] {
  const offenders: string[] = []
  for (const file of walk(root).filter((f) => f.endsWith('.tsx') && !f.includes('__tests__'))) {
    const src = readFileSync(file, 'utf8')
    for (const { tag, line } of buttonTags(src)) {
      // تجاهل التعليقات داخل الوسم
      const cleaned = tag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      if (CALLS_MUTATION.test(cleaned) && !PROTECTED.test(cleaned)) offenders.push(`${relative(process.cwd(), file)}:${line}`)
    }
  }
  return offenders
}

describe('عقد تعطيل أزرار الإرسال أثناء التنفيذ (00349)', () => {
  it('كل زر يستدعي mutate/mutateAsync في onClick يحمل disabled أو مؤشر انتظار', () => {
    expect(unprotectedMutationButtons()).toEqual([])
  })
  it('رسالة DUPLICATE_SUBMIT معرَّفة بالعربية في الخريطة العامة', () => {
    expect(readFileSync(join(root, 'lib/errors/error.handler.ts'), 'utf8')).toMatch(/DUPLICATE_SUBMIT: '[^']+'/)
  })
})
