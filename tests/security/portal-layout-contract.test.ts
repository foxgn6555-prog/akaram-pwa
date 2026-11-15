import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const shell = read('src/components/layout/AppShell.tsx')
const sidebar = read('src/components/layout/Sidebar/Sidebar.tsx')
const header = read('src/components/layout/Header/Header.tsx')
const globals = read('src/styles/globals.css')
const inbox = read('src/portals/complaints/pages/Inbox/InboxPage.tsx')
const processing = read('src/portals/complaints/pages/Processing/ProcessingPage.tsx')

/** عقد يمنع عودة تداخل الصفحات مع التنقل أو تغطية إجراءات الموبايل. */
describe('عقد التخطيط المتجاوب للبوابات', () => {
  it('يجعل الشريط والمحتوى عمودين في التدفق ويقصر التمرير على main', () => {
    expect(shell).toContain('isolate flex h-full min-h-0 w-full gap-2 overflow-hidden')
    expect(shell).toContain('pt-[env(safe-area-inset-top)]')
    expect(shell).toContain('h-full flex-none max-lg:hidden')
    expect(shell).toContain('min-h-0 min-w-0 flex-1 flex-col overflow-hidden')
    expect(shell).toContain('overflow-x-hidden overflow-y-auto')
    expect(shell).not.toMatch(/<main[\s\S]{0,250}className=["'{][^\n]*(?:fixed|absolute)/)
  })

  it('لا يحجز مجرى شريط تمرير على html/body فيظهر شريط أبيض عند حافة الشاشة', () => {
    expect(globals).toContain('overflow: hidden;')
    expect(globals).not.toContain('scrollbar-gutter: stable;')
    expect(shell).toContain('lg:[scrollbar-gutter:stable]')
  })

  it('يرتب طبقات درج الموبايل فوق الخلفية والهيدر دون تغيير عرض الدسكتوب', () => {
    expect(sidebar).toContain("'fixed inset-y-0 start-0 z-[90] h-dvh w-72 max-w-[85vw] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl'")
    expect(sidebar).toContain('fixed inset-0 z-[85]')
    expect(sidebar).toContain("collapsed ? 'w-20' : 'w-72'")
  })

  it('يغلق البحث قبل فتح الدرج ويوفر تجاوزاً مباشراً إلى المحتوى', () => {
    expect(header).toContain("setShowSearch(false); setSearchQuery(''); setMobileNav(true)")
    expect(shell).toContain('href="#app-main-content"')
    expect(shell).toContain('id="app-main-content"')
    expect(shell).toContain('tabIndex={-1}')
  })

  it('لا يفرض صندوق البريد عرضاً أفقياً ويبعد الإجراءات اللاصقة عن شريط الموبايل', () => {
    expect(inbox).not.toContain('min-w-[680px]')
    expect(inbox).toContain('sm:grid-cols-[1fr_1.4fr_.8fr_.6fr]')
    expect(inbox).toContain('bottom-[calc(5rem+env(safe-area-inset-bottom))]')
    expect(processing).toContain('bottom-[calc(5rem+env(safe-area-inset-bottom))]')
  })
})
