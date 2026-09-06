import type { ComplaintArchiveFolder, ComplaintDeletionRequest } from '@features/complaints/types'

interface Props {
  requests: ComplaintDeletionRequest[]
  folders: ComplaintArchiveFolder[]
  isSuperAdmin: boolean
  busy?: boolean
  onDecide: (requestId: string, approved: boolean) => void
  onRetry: (requestId: string) => void
}

const labels: Record<ComplaintDeletionRequest['status'], string> = {
  pending: 'بانتظار القرار', approved: 'تمت الموافقة', executing: 'جارٍ الحذف الآمن',
  failed: 'فشل التنفيذ', rejected: 'مرفوض', executed: 'نُفّذ',
}

export function ComplaintDeletionQueue({ requests, folders, isSuperAdmin, busy, onDecide, onRetry }: Props) {
  const active = requests.filter(request => ['pending', 'approved', 'executing', 'failed'].includes(request.status))
  const pending = active.filter(request => request.status === 'pending').length
  return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="complaint-deletion-queue">
    <div className="flex items-center justify-between">
      <div><h2 className="font-bold text-amber-950">طلبات الحذف النهائي للشكاوى</h2><p className="mt-1 text-xs text-amber-800">المعلّقة والتنفيذ الجاري والمحاولات التي تحتاج معالجة.</p></div>
      <span className="rounded-full bg-amber-200 px-2 text-xs font-bold">{active.length}</span>
    </div>
    {active.length === 0 ? <p className="mt-2 text-sm text-amber-800">لا توجد طلبات نشطة.</p> : <div className="mt-3 space-y-2">
      {active.map(request => { const folder = folders.find(value => value.id === request.folderId); return <div key={request.id} className="rounded-xl border bg-white p-3 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><b>{folder?.subject ?? 'مجلد شكوى مؤرشف'}</b><p className="mt-1 text-slate-600">{request.reason}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${request.status === 'failed' ? 'bg-rose-100 text-rose-800' : request.status === 'executing' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{labels[request.status]}</span></div>
        {request.attemptCount > 0 && <p className="mt-2 text-xs text-slate-500">عدد محاولات التنفيذ: {request.attemptCount}</p>}
        {request.status === 'failed' && <p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-800">تعذر حذف الملفات بأمان: {request.errorMessage ?? 'خطأ غير محدد'}</p>}
        {request.status === 'pending' && (isSuperAdmin ? <div className="mt-2 flex gap-2"><button disabled={busy} onClick={() => onDecide(request.id, true)} className="rounded-lg bg-rose-700 px-3 py-2 font-bold text-white disabled:opacity-40">توقيع وموافقة</button><button disabled={busy} onClick={() => onDecide(request.id, false)} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40">رفض</button></div> : <p className="mt-2 font-bold text-amber-800">القرار والتوقيع محصوران بمدير النظام.</p>)}
        {request.status === 'failed' && (isSuperAdmin ? <button disabled={busy} onClick={() => onRetry(request.id)} className="mt-2 rounded-lg bg-rose-700 px-3 py-2 font-bold text-white disabled:opacity-40">توقيع وإعادة محاولة الحذف</button> : <p className="mt-2 font-bold text-amber-800">إعادة المحاولة محصورة بمدير النظام.</p>)}
      </div> })}
    </div>}
    {pending > 0 && <p className="mt-3 text-xs font-bold text-amber-900">بانتظار القرار: {pending}</p>}
  </div>
}
