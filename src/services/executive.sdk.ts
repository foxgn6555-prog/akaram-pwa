/**
 * SDK الإدارة العليا (00146): الملخص التنفيذي الموحّد + التبليغات الداخلية.
 * حصري للأدوار: super_admin · executive_director · deputy_director · finance_officer (القراءة/النشر)،
 * أما الوارد والقراءة/الإقرار فلكل مستخدم مستهدف.
 */
import { sdkGuard, sdkVoid, supabase } from './client'
import type { Announcement, AnnouncementInput, AnnouncementRecipient, AnnouncementTargets, ExecFilterOptions, ExecOverview } from '@features/executive/types'

export const EXEC_ERROR_MESSAGES: Record<string, string> = {
  EXEC_FORBIDDEN: 'هذه اللوحة حصرية للإدارة العليا والمالية',
  EXEC_RANGE_INVALID: 'نطاق التاريخ غير صالح',
  EXEC_RANGE_TOO_WIDE: 'النطاق أوسع من 400 يوم — اختر فترة أقصر',
  ANN_FORBIDDEN: 'ليست لديك صلاحية نشر أو إدارة التبليغات',
  ANN_TITLE_REQUIRED: 'عنوان التبليغ مطلوب (3 أحرف على الأقل)',
  ANN_BODY_REQUIRED: 'نص التبليغ مطلوب',
  ANN_PRIORITY_INVALID: 'أولوية غير صالحة',
  ANN_AUDIENCE_INVALID: 'نوع الجهة المستهدفة غير صالح',
  ANN_AUDIENCE_EMPTY: 'اختر جهة مستهدفة واحدة على الأقل',
  ANN_NO_RECIPIENTS: 'لا يوجد أي مستلم مطابق للجهة المختارة',
  ANN_EXPIRY_INVALID: 'تاريخ الانتهاء يجب أن يكون في المستقبل',
  ANN_NOT_FOUND: 'التبليغ غير موجود',
  ANN_NOT_RECIPIENT: 'هذا التبليغ غير موجّه إليك',
}
export function execErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error ?? '')
  const code = Object.keys(EXEC_ERROR_MESSAGES).find((k) => text.includes(k))
  return (code && EXEC_ERROR_MESSAGES[code]) || text || 'خطأ غير معروف'
}

const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) => sdkGuard(supabase.rpc(fn, args as never)) as Promise<T>
const rpcVoid = (fn: string, args: Record<string, unknown> = {}) => sdkVoid(supabase.rpc(fn, args as never))

export const executive = {
  overview(from: string, to: string, sector: number | null = null, shift: string | null = null): Promise<ExecOverview> {
    return rpc<ExecOverview>('exec_overview', { p_from: from, p_to: to, p_sector: sector, p_shift: shift })
  },
  filterOptions(): Promise<ExecFilterOptions> { return rpc<ExecFilterOptions>('exec_filter_options') },

  // ── التبليغات ──
  publish(v: AnnouncementInput): Promise<string> {
    return rpc<string>('announcement_publish', {
      p_title: v.title, p_body: v.body, p_priority: v.priority, p_audience_kind: v.audience_kind,
      p_roles: v.roles, p_departments: v.departments, p_users: v.users,
      p_requires_ack: v.requires_ack, p_pinned: v.pinned, p_expires_at: v.expires_at, p_attachment_path: null,
    })
  },
  feed(scope: 'inbox' | 'sent', includeArchived = false, limit = 100): Promise<Announcement[]> {
    return rpc<Announcement[]>('announcement_feed', { p_scope: scope, p_limit: limit, p_include_archived: includeArchived })
  },
  get(id: string): Promise<Announcement> { return rpc<Announcement>('announcement_get', { p_id: id }) },
  ack(id: string) { return rpcVoid('announcement_ack', { p_id: id }) },
  archive(id: string, reason?: string) { return rpcVoid('announcement_archive', { p_id: id, p_reason: reason ?? null }) },
  recipients(id: string): Promise<AnnouncementRecipient[]> { return rpc<AnnouncementRecipient[]>('announcement_recipients', { p_id: id }) },
  unreadCount(): Promise<number> { return rpc<number>('announcement_unread_count') },
  targets(): Promise<AnnouncementTargets> { return rpc<AnnouncementTargets>('announcement_targets') },
}
