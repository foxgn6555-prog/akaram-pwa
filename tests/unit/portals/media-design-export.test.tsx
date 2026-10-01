// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  a4PortraitBox,
  buildStandaloneHtml,
  designFileName,
  pageSlide,
  reportPages,
  SLIDE_EMU,
} from '@features/media/lib/design-export'

const h = vi.hoisted(() => ({ exportDesign: vi.fn() }))
vi.mock('@features/media/lib/design-export', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  exportDesign: h.exportDesign,
}))

import DesignExportMenu from '../../../src/portals/media/pages/Designs/DesignExportMenu'

describe('design-export — الدوال النقية', () => {
  it('اسم الملف يحافظ على العربية ويزيل الرموز الممنوعة ويضيف التاريخ والامتداد الصحيح', () => {
    const d = new Date('2026-10-01T10:00:00Z')
    expect(designFileName('تقرير: الكرادة / أيلول', 'pdf', d)).toBe('تقرير-الكرادة-أيلول-2026-10-01.pdf')
    expect(designFileName('', 'pptx', d)).toBe('تقرير-مصور-2026-10-01.pptx')
    expect(designFileName('x', 'html', d).endsWith('.html')).toBe(true)
  })

  it('الـHTML المستقل: RTL، A4 بلا هوامش متصفح، ورقة لكل صفحة، ألوان مطبوعة', () => {
    const html = buildStandaloneHtml('تقرير <الكرادة>', [{ html: '<div>1</div>' }, { html: '<div>2</div>' }])
    expect(html).toContain('<html lang="ar" dir="rtl">')
    expect(html).toContain('<title>تقرير &lt;الكرادة&gt;</title>')
    expect(html).toContain('@page { size: A4; margin: 0; }')
    expect(html).toContain('print-color-adjust: exact')
    expect(html.match(/class="xp-page"/g)?.length).toBe(2)
  })

  it('ورقة A4 العمودية تُوسَّط بكامل ارتفاع شريحة 16:9', () => {
    const b = a4PortraitBox()
    expect(b.h).toBe(SLIDE_EMU.cy)
    expect(b.w).toBe(Math.round((SLIDE_EMU.cy * 210) / 297))
    expect(b.x * 2 + b.w).toBeGreaterThanOrEqual(SLIDE_EMU.cx - 1)
    expect(b.x * 2 + b.w).toBeLessThanOrEqual(SLIDE_EMU.cx + 1)
  })

  it('شريحة الصفحة تربط الصورة بالعلاقة rId1 وبموضع A4 الموسَّط', () => {
    const s = pageSlide(2, 'page3.png')
    const b = a4PortraitBox()
    expect(s.xml).toContain('name="Page 3"')
    expect(s.xml).toContain('r:embed="rId1"')
    expect(s.xml).toContain(`<a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/>`)
    expect(s.rels).toContain('Target="../media/page3.png"')
    expect(s.rels).toContain('slideLayout1.xml')
  })

  it('reportPages يلتقط أوراق التقرير فقط داخل #design-report', () => {
    document.body.innerHTML =
      '<div id="design-report"><section class="rp-page">a</section><section class="rp-page">b</section></div><section class="rp-page">خارج</section>'
    expect(reportPages().map((p) => p.textContent)).toEqual(['a', 'b'])
  })
})

describe('DesignExportMenu', () => {
  beforeEach(() => h.exportDesign.mockReset())

  it('يعرض الخيارات الثلاثة PDF / PowerPoint / HTML ويستدعي التصدير بالصيغة المختارة والعنوان', async () => {
    h.exportDesign.mockResolvedValue(undefined)
    render(<DesignExportMenu title="تقرير الكرادة" />)
    fireEvent.click(screen.getByTestId('design-export-menu'))
    expect(screen.getByTestId('design-export-pdf')).toBeTruthy()
    expect(screen.getByTestId('design-export-pptx')).toBeTruthy()
    expect(screen.getByTestId('design-export-html')).toBeTruthy()
    fireEvent.click(screen.getByTestId('design-export-pptx'))
    await waitFor(() => expect(h.exportDesign).toHaveBeenCalledTimes(1))
    expect(h.exportDesign.mock.calls[0]?.[0]).toBe('pptx')
    expect(h.exportDesign.mock.calls[0]?.[1]).toBe('تقرير الكرادة')
    expect(screen.queryByTestId('design-export-options')).toBeNull()
  })

  it('يعرض التقدّم ورقةً ورقة أثناء التصدير ويعطّل الزر', async () => {
    let resolve!: () => void
    h.exportDesign.mockImplementation((_f: string, _t: string, onProgress?: (d: number, t: number) => void) => {
      onProgress?.(2, 5)
      return new Promise<void>((r) => (resolve = r))
    })
    render(<DesignExportMenu title="x" />)
    fireEvent.click(screen.getByTestId('design-export-menu'))
    fireEvent.click(screen.getByTestId('design-export-pdf'))
    await waitFor(() => expect(screen.getByTestId('design-export-menu').textContent).toContain('(2/5)'))
    expect((screen.getByTestId('design-export-menu') as HTMLButtonElement).disabled).toBe(true)
    resolve()
    await waitFor(() => expect((screen.getByTestId('design-export-menu') as HTMLButtonElement).disabled).toBe(false))
  })

  it('رسالة واضحة عندما لا توجد أوراق (المعاينة مغلقة)', async () => {
    h.exportDesign.mockRejectedValue(new Error('NO_PAGES'))
    render(<DesignExportMenu title="x" />)
    fireEvent.click(screen.getByTestId('design-export-menu'))
    fireEvent.click(screen.getByTestId('design-export-html'))
    await waitFor(() => expect(screen.getByTestId('design-export-error').textContent).toContain('افتح المعاينة'))
  })
})

describe('حزمة PowerPoint من الصفحات', () => {
  it('buildPptx يُنتج ملفاً صالحاً فيه شريحة وصورة لكل ورقة', async () => {
    const { buildPptx } = await import('@lib/pptx/complaintPptx')
    const { default: JSZip } = await import('jszip')
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const slides = [0, 1].map((i) => {
      const s = pageSlide(i, `page${i + 1}.png`)
      s.images.push({ name: `page${i + 1}.png`, bytes: png })
      return s
    })
    const bytes = await buildPptx(slides, 'تقرير', new JSZip())
    const zip = await JSZip.loadAsync(bytes)
    const names = Object.keys(zip.files)
    expect(names).toContain('ppt/slides/slide1.xml')
    expect(names).toContain('ppt/slides/slide2.xml')
    expect(names).toContain('ppt/media/page1.png')
    expect(names).toContain('ppt/media/page2.png')
    expect(await zip.file('ppt/presentation.xml')!.async('string')).toContain('slide2.xml'.replace('slide2.xml', 'rId3'))
  })
})
