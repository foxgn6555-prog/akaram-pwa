/** أنواع منظومة الإدارة العليا (00146): الملخص التنفيذي + التبليغات */

export interface NamedCount { name: string; count: number; tons?: number; qty?: number; deficit?: number }
export interface KeyedCount { key: string; count: number }

export interface ExecOverview {
  period: { from: string; to: string; days: number; sector: string | null; shift: string | null; generated_at: string }
  workforce: {
    active: number; hired: number; terminated: number
    by_department: NamedCount[]
    attendance: { present: number; late: number; absent: number; incomplete: number; leave: number; shortfall_minutes: number; overtime_minutes: number; deduction_days: number }
    attendance_series: Array<{ d: string; present: number; absent: number; late: number }>
    leaves: { pending: number; approved: number; rejected: number; days: number }
    alerts: number
  }
  complaints: { total: number; open: number; resolved: number; by_status: KeyedCount[]; by_sector: NamedCount[]; by_type: NamedCount[]; series: Array<{ d: string; count: number }> }
  fleet: {
    vehicles: number; departures: number; returned: number; open_now: number; avg_hours: number
    by_shift: NamedCount[]; by_sector: NamedCount[]; series: Array<{ d: string; count: number }>; breakdowns: number; gps_alerts: number
    maintenance: { opened: number; closed: number; open_now: number; avg_hours: number; cost: number; by_fault: NamedCount[] }
  }
  station: { weighings: number; tons: number; violations: number; deficit_tons: number; by_kind: NamedCount[]; by_destination: NamedCount[]; series: Array<{ d: string; count: number; tons: number }>; top_violators: NamedCount[] }
  disclosures: { total: number; by_violation: NamedCount[]; by_status: KeyedCount[]; by_contractor: NamedCount[] }
  media: { submissions: number; photos: number; by_work_type: NamedCount[] }
  gbs: { total: number; by_status: KeyedCount[]; updates: number }
  supplies: { total: number; by_status: KeyedCount[]; by_type: NamedCount[] }
  finance: {
    payroll: { month: string; status: string; employees: number; proposed_total: number; final_total: number; deductions_total: number; allowances_total: number } | null
    payroll_months: Array<{ month: string; status: string; total: number }>
    purchases: { orders: number; total: number; items: number }
    budget: { year: number; allocated: number; spent: number; by_category: Array<{ name: string; allocated: number; spent: number }> }
    maintenance_cost: number
  }
}

export interface ExecFilterOptions {
  sectors: Array<{ id: number; name: string; parent: string }>
  shifts: Array<{ key: string; label: string }>
  parents: Array<{ key: string; label: string }>
}

export type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | 'prev_month' | 'quarter' | 'half' | 'year' | 'custom'
export interface ExecFilters { from: string; to: string; preset: PeriodPreset; sector: number | null; shift: string | null }

// ── التبليغات ──
export type AnnouncementPriority = 'normal' | 'important' | 'urgent'
export type AudienceKind = 'all' | 'roles' | 'departments' | 'users'

export interface Announcement {
  id: string; title: string; body: string; priority: AnnouncementPriority; audience_kind: AudienceKind
  audience_roles: string[]; audience_departments: string[]; audience_users: string[]
  requires_ack: boolean; pinned: boolean; attachment_path: string | null
  published_by: string; publisher_name: string; publisher_role: string
  published_at: string; expires_at: string | null; archived_at: string | null
  recipients_count: number; read_count: number; ack_count: number
  my_read_at: string | null; my_acked_at: string | null; is_mine: boolean
}

export interface AnnouncementInput {
  title: string; body: string; priority: AnnouncementPriority; audience_kind: AudienceKind
  roles: string[]; departments: string[]; users: string[]
  requires_ack: boolean; pinned: boolean; expires_at: string | null
}

export interface AnnouncementTargets {
  roles: Array<{ role: string; count: number }>
  departments: Array<{ id: string; name: string; count: number }>
  users: Array<{ id: string; name: string; department: string | null }>
  total_users: number
}

export interface AnnouncementRecipient { user_id: string; full_name: string; department_name: string | null; delivered_at: string; read_at: string | null; acked_at: string | null }
