/**
 * الجولة ٥ — زر «الدعم الفني» العائم: يظهر في كل البوابات ويغلق/يفتح نافذة الطلب.
 * لا يستدعي أي hook قبل فتح النافذة (كي يبقى إطار التطبيق مستقلاً عن مزوّد الاستعلامات).
 */
import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { SupportDialog } from '@features/support/SupportDialog'

export function SupportFab({ portal }: { portal: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        data-testid="support-fab"
        onClick={() => setOpen(true)}
        aria-label="الدعم الفني"
        className="fixed bottom-[calc(4.9rem+env(safe-area-inset-bottom))] end-4 z-40 flex h-11 items-center gap-1.5 rounded-full bg-slate-900/95 px-4 text-[11px] font-black text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 lg:bottom-5"
      >
        <LifeBuoy size={15} />
        الدعم الفني
      </button>
      {open && <SupportDialog open onClose={() => setOpen(false)} portal={portal} />}
    </>
  )
}
