/** SDK مسؤول القاطع (00160) + سلاسل الموافقات. لا بيانات مالية هنا إطلاقاً. */
import { sdkGuard, sdkVoid, supabase } from './client'

export type ParentSector = 'karrada' | 'zaafaraniya'
export interface SectorManagerOption { parent_sector: ParentSector; name: string; areas: number; department_managers: number; sector_managers: { user_id: string; name: string }[] }
export interface SectorManagerProfile { user_id: string; parent_sectors: ParentSector[]; parent_names: string[]; notes: string | null; updated_at: string }
export interface SectorManagerMe { user_id: string; full_name: string; parent_sectors: ParentSector[]; parent_names: string[]; areas: number; department_managers: number; contractors: number; employee_id: string | null; has_employee: boolean }
export interface TeamArea { id: number; name: string; contractor_user_id: string | null; contractor_name: string | null; checked_in: boolean; in_zone: boolean | null; workers: number; present: number; absent: number }
export interface SectorTeamRow {
  manager_user_id: string; manager_name: string; manager_phone: string | null; shift: string; parent_sector: ParentSector; areas: TeamArea[]
  contractors: number; workers: number; present_today: number; absent_today: number; presence_proved: number; out_of_zone: number; vehicles_now: number; on_leave_today: boolean
}
export interface SectorDashboard {
  is_field_ops: boolean; sector_managers: { user_id: string; name: string; parent_names: string[] }[]; parents_detail: ParentSectorDetail[]
  parent_sectors: { code: ParentSector; name: string }[]; areas: number; department_managers: number; contractors: number; areas_without_contractor: number; workers: number
  present_today: number; absent_today: number; presence_proved: number; out_of_zone: number; vehicles_now: number; pending_requests: number; managers_on_leave: number; notices_sent: number
  areas_detail: { id: number; name: string; parent_sector: ParentSector; manager_name: string | null; contractor_name: string | null; checked_in: boolean; in_zone: boolean | null; present: number; absent: number; vehicles_now: number }[]
}
export interface SectorReports {
  from: string; to: string; days: number
  totals: { present: number; absent: number; presence_proofs: number; out_of_zone: number; trips: number; manager_leaves: number }
  series: { d: string; present: number; absent: number; proofs: number }[]
  contractors: { user_id: string; name: string; area: string; parent_sector: ParentSector; manager_name: string; shift: string; workers: number; present: number; absent: number; proof_days: number; out_of_zone_days: number }[]
  managers: { user_id: string; name: string; shift: string; parent_sector: ParentSector; areas: string; contractors: number; present: number; absent: number; trips: number; leave_days: number; permits: number }[]
}
export interface NotifyTarget { user_id: string; full_name: string; role: 'admin_ops' | 'department_manager'; parent_sector: ParentSector; areas: string; shift: string | null }
/** 00161: تفصيل قاطع أم واحد (للعمليات الميدانية — مقارنة القاطعين) */
/** 00261: متابعة المتعهدين والعمال (مسؤول القاطع) */
export interface SmContractorRow {
  contractor_user_id: string; contractor_name: string; contractor_phone: string | null; sector_id: number; area_name: string; parent_sector: ParentSector; shift: string | null
  department_manager_name: string | null
  checked_in: boolean; checkin_at: string | null; latitude: number | null; longitude: number | null; accuracy_m: number | null; in_zone: boolean | null
  selfie_path: string | null; team_photo_path: string | null
  contractor_headcount: number | null; follow_up_headcount: number | null; my_headcount: number | null; my_updated_at: string | null; editable: boolean
}
export interface SmContractorMonthDay { log_date: string; checked_in: boolean; checkin_at: string | null; in_zone: boolean | null; selfie_path: string | null; team_photo_path: string | null; contractor_headcount: number | null; follow_up_headcount: number | null; admin_ops_headcount: number | null }
export interface SmContractorsSummary { contractors: number; checked_in: number; out_of_zone: number; counted_by_me: number; month_locked: boolean }
export interface ParentSectorDetail { code: ParentSector; name: string; sector_managers: string | null; areas: number; department_managers: number; contractors: number; areas_without_contractor: number; present_today: number; absent_today: number; presence_proved: number; out_of_zone: number; vehicles_now: number }
export interface FieldOpsSectorManager { user_id: string; full_name: string; phone: string | null; parent_sectors: ParentSector[]; parent_names: string[]; department_managers: number; contractors: number; present_today: number; absent_today: number; presence_proved: number; pending_tasks: number; on_leave_today: boolean; has_employee: boolean }
export interface SectorNotice { id: string; title: string; body: string; recipients_count: number; recipient_names: string; created_at: string }

/** 00334: خصائص الخطوة الاختيارية — نمط «الجميع»، شرط، مهلة بالأيام، تصعيد */
export interface ApprovalStepOptions { mode?: 'any' | 'all'; condition?: { field: 'amount' | 'days' | 'minutes'; op: 'gte' | 'lte'; value: number } | null; sla_days?: number | null; escalate?: 'none' | 'next' }
export type ApprovalStep = ({ kind: 'hierarchy'; role: string; label?: string } | { kind: 'account'; user_id: string; label?: string }) & ApprovalStepOptions
export type ApprovalRequestType = 'leave' | 'time_permit' | 'supplies' | 'termination' | 'disclosure' | 'advance' | 'cold_archive_purge' | 'complaint_report' | 'hire'
export interface ApprovalChainVersion { id: string; version_no: number; action: 'created' | 'updated' | 'deleted'; steps: ApprovalStep[]; is_active: boolean; changed_by_name: string | null; changed_at: string }
export interface ApprovalSimulationStep { step_no: number; label: string; mode: 'any' | 'all'; sla_days: number | null; escalate: 'none' | 'next'; condition: string | null; status: 'active' | 'skipped_condition' | 'skipped_nobody'; approvers: { user_id: string; name: string }[]; delegates: { to_name: string; from_name: string }[] }
/** 00336: تفويض موافقات (من مستخدم إلى آخر لفترة ≤ 90 يوماً) */
export interface ApprovalDelegation { id: string; from_user: string; from_name: string; to_user: string; to_name: string; starts_on: string; ends_on: string; note: string | null; is_active: boolean; is_current: boolean; created_at: string }
/** 00337: تقرير أداء الموافقات */
export interface ApprovalPerfSummary { decided: number; approved: number; rejected: number; avg_hours: number | null; median_hours: number | null; within_sla: number; with_sla: number; delegated: number; escalated: number; open_now: number; overdue_now: number; open_avg_hours: number | null }
export interface ApprovalPerfKind { kind: string; label: string; decided: number; avg_hours: number | null; max_hours: number | null; rejected: number; open_now: number }
export interface ApprovalPerfStep { kind: string; kind_label: string; step_label: string; decided: number; avg_hours: number | null; max_hours: number | null; overdue: number; open_now: number }
export interface ApprovalPerfApprover { user_id: string; name: string; decided: number; avg_hours: number | null; as_delegate: number; pending_now: number; overdue_now: number }
export interface ApprovalPerfOpenTask { task_id: string; kind: string; kind_label: string; step_no: number; step_label: string; hours: number; due_at: string | null; overdue: boolean; escalated: boolean; approvers: string | null }
export interface ApprovalPerfEscalation { task_id: string; kind_label: string; step_label: string; escalated_at: string; status: string; approvers: string | null }
export interface ApprovalPerformanceReport { from: string; to: string; summary: ApprovalPerfSummary; by_kind: ApprovalPerfKind[]; by_step: ApprovalPerfStep[]; by_approver: ApprovalPerfApprover[]; open_tasks: ApprovalPerfOpenTask[]; escalations: ApprovalPerfEscalation[] }
export interface ApprovalSimulation { chain_id: string | null; requester_role?: string; requester_label?: string; subtype?: string | null; department_id?: string | null; department_name?: string | null; note?: string; steps: ApprovalSimulationStep[] }
/** 00391: تشخيص السلسلة لموظف — ما الذي سيُطبَّق ولماذا لا توجد سلسلة */
export interface ApprovalEmployeeLookup { id: string; full_name: string; employee_number: string; job_title: string | null; department_name: string | null; has_account: boolean; manager_name: string | null }
export interface ApprovalDiagnoseCheck { key: string; label: string; ok: boolean; detail: string }
export interface ApprovalDiagnosePathNode { department_id: string; name: string; depth: number; chains: { id: string; subtype: string | null; is_active: boolean; include_children: boolean; applies: boolean }[] }
export interface ApprovalDiagnosis {
  employee: { id: string; full_name: string; employee_number: string; department_id: string | null; department_name: string | null; has_account: boolean; roles: string[]; manager_id: string | null; manager_name: string | null; manager_has_account: boolean }
  type: string; subtype: string | null
  chain: { id: string; scope: 'role' | 'department'; requester_role: string; requester_label: string; subtype: string | null; department_id: string | null; department_name: string | null; include_children: boolean } | null
  steps: ApprovalSimulationStep[]; active_steps: number; department_path: ApprovalDiagnosePathNode[]; checks: ApprovalDiagnoseCheck[]
  ok: boolean; fallback: 'chain' | 'manager' | 'hr_only' | 'none'; reason: string | null; hints: string[]
}
export interface ApprovalChain { id: string; requester_role: string; requester_label: string; request_type: ApprovalRequestType; subtype?: string | null; subtype_label?: string | null; steps: ApprovalStep[]; is_active: boolean; updated_at: string; updated_by_name: string | null; version_no?: number; department_id?: string | null; department_name?: string | null; include_children?: boolean; department_path?: string | null }
export interface SupplyItem { item_id: string; name: string; unit: string; qty: number; delivered_qty: number | null }
export interface ApprovalTask {
  task_id: string; request_kind: ApprovalRequestType; request_id: string; step_no: number; total_steps: number; step_label: string
  requester_user_id: string; requester_name: string; requester_role: string; requester_role_label: string; area_name: string | null; parent_sector: string | null
  type_name: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null; days: number; minutes: number; notes: string | null; attachment_path: string | null; created_at: string
  previous_steps: { step_no: number; label: string; status: string; decided_by: string | null; decided_at: string | null; note: string | null }[]
  /** 00162: طلب مستلزمات — المواد المطلوبة ورقم الكتاب */
  items: SupplyItem[] | null; ref_no: string | null
  /** 00163: طلب إنهاء خدمة — تفاصيل الهدف · 00191: طلب سلفة — الموظف والمبلغ وطريقة التسديد */
  /** 00197: إجازة/زمنية بأثر رجعي */
  details: TerminationTaskDetails | AdvanceTaskDetails | BackdatedTaskDetails | ColdPurgeTaskDetails | ComplaintReportTaskDetails | HireTaskDetails | null
}
export interface BackdatedTaskDetails { backdated: true; reason: string; days_late: number; prior_status: string | null; month_count: number; alert_threshold: number }
export interface AdvanceTaskDetails {
  employee_name: string; employee_number: string | null; type_name: string; amount: number; requested_amount: number
  method: 'equal' | 'fixed' | 'percent' | 'single'; method_label: string; installments: number | null; monthly_amount: number | null; percent: number | null; estimated_installment: number | null
}
export type TerminationType = 'resignation' | 'dismissal' | 'contract_end' | 'retirement' | 'death'
export const TERMINATION_TYPE_AR: Record<TerminationType, string> = { resignation: 'استقالة', dismissal: 'فصل', contract_end: 'انتهاء عقد', retirement: 'تقاعد', death: 'وفاة' }
/** 00339: تفاصيل مهمة اعتماد تقرير شكاوى */
export interface ComplaintReportTaskDetails { title: string; sector: 'karrada' | 'zaafaraniya'; sector_label: string; report_date: string; scope: 'daily' | 'email'; items: number; recipients: string[]; pptx_path: string | null; review_confirmed_at: string | null }
/** 00338: تفاصيل مهمة حذف أرشيف بارد */
export interface ColdPurgeTaskDetails { code: string; period_from: string; period_to: string; file_count: number; total_bytes: number; verified_copies: number; required_copies: number; purge_available_at: string | null; copies: string | null; by_source: Array<{ source_key: string; files: number }> }
/** 00348: تفاصيل طلب تعيين موظف (بلا رقم وظيفي — تكتبه الموارد البشرية بعد الاعتماد) */
export interface HireTaskDetails { full_name: string; phone: string | null; job_title: string; department: string | null; hire_date: string; contract_type: 'monthly' | 'daily'; contract_label: string; shift_name: string | null; source: 'garage' | 'station' | 'maintenance'; source_label: string }
export interface TerminationTaskDetails { target_name: string; target_label: string; target_kind: 'employee' | 'worker'; type: TerminationType; type_label: string; last_day: string }
export interface TerminationTarget { target_kind: 'employee' | 'worker'; employee_id: string | null; worker_id: string | null; user_id: string | null; full_name: string; label: string; scope: string; employee_number: string | null }
export interface TerminationRequest {
  id: string; target_kind: 'employee' | 'worker'; target_name: string; target_label: string; termination_type: TerminationType; termination_type_label: string; last_day: string; reason: string
  status: 'pending' | 'executed' | 'rejected' | 'cancelled'; current_step: string | null; chain_id: string | null; created_at: string; decided_at: string | null; executed_at: string | null
}
export interface ApprovalTimelineRow { step_no: number; step_label: string; status: 'waiting' | 'pending' | 'approved' | 'rejected' | 'skipped'; approvers: { user_id: string; name: string }[]; decided_by_name: string | null; decided_at: string | null; note: string | null }

const one = <T>(rows: unknown): T | null => (Array.isArray(rows) ? ((rows[0] as T) ?? null) : ((rows as T) ?? null))

/** 00334: تنظيف الخطوة قبل الإرسال — الحقول الاختيارية تُرسل فقط إن كانت غير افتراضية */
export const cleanStep = (s: ApprovalStep): Record<string, unknown> => ({
  ...(s.kind === 'hierarchy' ? { kind: 'hierarchy', role: s.role } : { kind: 'account', user_id: s.user_id }),
  ...(s.mode === 'all' ? { mode: 'all' } : {}),
  ...(s.condition ? { condition: { field: s.condition.field, op: s.condition.op, value: s.condition.value } } : {}),
  ...(s.sla_days ? { sla_days: s.sla_days } : {}),
  ...(s.escalate === 'next' ? { escalate: 'next' } : {}),
})

export const sectorManager = {
  // ── 00261: متابعة المتعهدين والعمال ──
  async contractors(date?: string | null, contractor?: string | null, parent?: ParentSector | null): Promise<SmContractorRow[]> {
    return ((await sdkGuard(supabase.rpc('sector_manager_contractors', { p_date: date ?? null, p_contractor: contractor ?? null, p_parent: parent ?? null }))) as SmContractorRow[] | null) ?? []
  },
  async setContractorHeadcount(contractorUserId: string, headcount: number): Promise<void> {
    await sdkGuard(supabase.rpc('sector_manager_set_headcount', { p_contractor: contractorUserId, p_headcount: headcount }))
  },
  async contractorMonth(contractorUserId: string, month?: string | null): Promise<SmContractorMonthDay[]> {
    return ((await sdkGuard(supabase.rpc('sector_manager_contractor_month', { p_contractor: contractorUserId, p_month: month ?? null }))) as SmContractorMonthDay[] | null) ?? []
  },
  async contractorsSummary(): Promise<SmContractorsSummary | null> {
    const rows = (await sdkGuard(supabase.rpc('sector_manager_contractors_summary'))) as SmContractorsSummary[] | null
    return rows?.[0] ?? null
  },
  // التطوير المركزية
  options: async () => (await sdkGuard(supabase.rpc('sector_manager_options'))) as SectorManagerOption[],
  profileForUser: async (userId: string) => one<SectorManagerProfile>(await sdkGuard(supabase.rpc('sector_manager_profile_for_user', { p_user_id: userId }))),
  saveProfile: async (userId: string, parentSectors: ParentSector[], notes?: string | null) =>
    sdkGuard(supabase.rpc('sector_manager_profile_save', { p_user_id: userId, p_parent_sectors: parentSectors, p_notes: notes ?? null })),
  // البوابة
  me: async () => one<SectorManagerMe>(await sdkGuard(supabase.rpc('sector_manager_me'))),
  team: async () => (await sdkGuard(supabase.rpc('sector_manager_team'))) as SectorTeamRow[],
  dashboard: async () => (await sdkGuard(supabase.rpc('sector_manager_dashboard'))) as SectorDashboard,
  reports: async (from?: string, to?: string) => (await sdkGuard(supabase.rpc('sector_manager_reports', { p_from: from ?? null, p_to: to ?? null }))) as SectorReports,
  notifyTargets: async () => (await sdkGuard(supabase.rpc('sector_manager_notify_targets'))) as NotifyTarget[],
  notify: async (title: string, body: string, targets?: string[]) => (await sdkGuard(supabase.rpc('sector_manager_notify', { p_title: title, p_body: body, p_targets: targets && targets.length ? targets : null }))) as number,
  notices: async () => (await sdkGuard(supabase.rpc('sector_manager_notices'))) as SectorNotice[],
  /** 00161: العمليات الميدانية — مسؤولو القواطع */
  fieldOpsSectorManagers: async () => (await sdkGuard(supabase.rpc('field_ops_sector_managers'))) as FieldOpsSectorManager[],
}

export const approvals = {
  chains: async () => (await sdkGuard(supabase.rpc('approval_chains_list'))) as ApprovalChain[],
  saveChain: async (requesterRole: string, requestType: ApprovalRequestType, steps: ApprovalStep[], active = true, subtype: string | null = null, department: string | null = null, includeChildren = true) =>
    (await sdkGuard(supabase.rpc('approval_chain_save', { p_requester_role: requesterRole, p_request_type: requestType, p_steps: steps.map(cleanStep), p_active: active, p_subtype: subtype, p_department: department, p_include_children: includeChildren }))) as string,
  /** 00391: بحث موظف للتشخيص */
  employeeLookup: async (q: string) => (await sdkGuard(supabase.rpc('approval_employee_lookup', { p_q: q.trim() || null }))) as ApprovalEmployeeLookup[],
  /** 00391: تشخيص سلسلة موظف (IT/HR/غرفة العمليات/الموظف نفسه/مديره) */
  diagnose: async (employeeId: string, type: ApprovalRequestType, subtype: string | null = null, context: Record<string, number> = {}) =>
    (await sdkGuard(supabase.rpc('approval_diagnose', { p_employee: employeeId, p_type: type, p_subtype: subtype, p_context: context }))) as ApprovalDiagnosis,
  deleteChain: async (id: string) => sdkVoid(supabase.rpc('approval_chain_delete', { p_id: id })),
  /** 00335: سجل إصدارات سلسلة */
  chainVersions: async (chainId: string) => (await sdkGuard(supabase.rpc('approval_chain_versions_list', { p_chain: chainId }))) as ApprovalChainVersion[],
  /** 00335: محاكاة — من سيوافق لو طلب هذا المستخدم هذا النوع بهذا السياق */
  simulate: async (userId: string, type: ApprovalRequestType, subtype: string | null, context: Record<string, number>) =>
    (await sdkGuard(supabase.rpc('approval_simulate', { p_user: userId, p_type: type, p_subtype: subtype, p_context: context }))) as ApprovalSimulation,
  /** 00336: تفويضاتي (أو الكل لـ IT) */
  delegations: async (all = false) => (await sdkGuard(supabase.rpc('approval_delegations_list', { p_all: all }))) as ApprovalDelegation[],
  delegationSet: async (x: { toUser: string; startsOn: string; endsOn: string; note?: string | null; fromUser?: string | null }) =>
    (await sdkGuard(supabase.rpc('approval_delegation_set', { p_to_user: x.toUser, p_starts_on: x.startsOn, p_ends_on: x.endsOn, p_note: x.note ?? null, p_from_user: x.fromUser ?? null }))) as string,
  delegationCancel: async (id: string) => sdkVoid(supabase.rpc('approval_delegation_cancel', { p_id: id })),
  /** 00337: تقرير الأداء (IT / المدير المفوض) */
  performance: async (from: string, to: string) => (await sdkGuard(supabase.rpc('approval_performance_report', { p_from: from, p_to: to }))) as ApprovalPerformanceReport,
  myTasks: async () => (await sdkGuard(supabase.rpc('approval_my_tasks'))) as ApprovalTask[],
  timeline: async (kind: ApprovalRequestType, requestId: string) => (await sdkGuard(supabase.rpc('approval_timeline', { p_kind: kind, p_request: requestId }))) as ApprovalTimelineRow[],
  /** 00162: قرار موحّد حسب نوع الطلب (إجازة/زمنية → hr_leave_decide، مستلزمات → supply_request_decide) */
  decide: async (kind: ApprovalRequestType, requestId: string, approve: boolean, note?: string | null) => sdkVoid(supabase.rpc('approval_decide_request', { p_kind: kind, p_request: requestId, p_approve: approve, p_note: note ?? null })),
}

/** 00163: وحدة «الإجراءات» — طلبات إنهاء الخدمة بنطاقات متدرجة عبر سلاسل الموافقات. لا بيانات مالية. */
export const procedures = {
  targets: async () => (await sdkGuard(supabase.rpc('termination_targets'))) as TerminationTarget[],
  create: async (x: { targetKind: 'employee' | 'worker'; targetId: string; type: TerminationType; lastDay: string; reason: string; attachment?: string | null }) =>
    (await sdkGuard(supabase.rpc('termination_request_create', { p_target_kind: x.targetKind, p_target_id: x.targetId, p_type: x.type, p_last_day: x.lastDay, p_reason: x.reason, p_attachment: x.attachment ?? null }))) as string,
  mine: async () => (await sdkGuard(supabase.rpc('termination_requests_mine'))) as TerminationRequest[],
  cancel: async (id: string) => sdkVoid(supabase.rpc('termination_request_cancel', { p_id: id })),
}
