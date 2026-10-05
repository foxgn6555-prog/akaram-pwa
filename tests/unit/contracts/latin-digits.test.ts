import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** عقد: الأرقام إنكليزية (0-9) في كل الشاشات — أي تنسيق عربي يجب أن يحمل -u-nu-latn (كانت الشاشات تخلط ١٥:٥٣ مع 18:22) */
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)) out.push(p)
  }
  return out
}

describe('latin digits contract', () => {
  it('no Arabic locale without nu-latn in src', () => {
    const bad: string[] = []
    for (const p of walk('src')) {
      const src = readFileSync(p, 'utf8')
      const re = /(toLocale\w*String|NumberFormat|DateTimeFormat)\(\s*'(ar|ar-IQ|ar-EG|ar-SA)'/g
      if (re.test(src)) bad.push(p)
    }
    expect(bad).toEqual([])
  })
  it('ar-IQ-u-nu-latn renders Latin digits', () => {
    expect(new Date('2026-10-05T12:53:00Z').toLocaleTimeString('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Baghdad' })).toBe('15:53')
  })
})
