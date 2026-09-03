/** الأدوار النظامية — mirror لقيد CHECK في 00003 + توسعة 00035 (7 بوابات جديدة) */
export const ROLES = {
  EMPLOYEE: 'employee',
  HR_OFFICER: 'hr_officer',
  DEPARTMENT_MANAGER: 'department_manager',
  FINANCE_OFFICER: 'finance_officer',
  IT_ADMIN: 'it_admin',
  SUPER_ADMIN: 'super_admin',
  FIELD_OPS: 'field_ops',
  ADMIN_OPS: 'admin_ops',
  MAINTENANCE: 'maintenance',
  TRANSFER_STATION: 'transfer_station',
  EXECUTIVE_DIRECTOR: 'executive_director',
  DEPUTY_DIRECTOR: 'deputy_director',
  OPS_ROOM: 'ops_room',
  DISCLOSURES_OFFICER: 'disclosures_officer',
  COMPLAINTS_OFFICER: 'complaints_officer',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

/** أولوية الدور الأساسي في JWT — mirror لـ app.custom_access_token_hook (محدّث في 00035) */
export const ROLE_PRIORITY: readonly Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.IT_ADMIN,
  ROLES.EXECUTIVE_DIRECTOR,
  ROLES.DEPUTY_DIRECTOR,
  ROLES.OPS_ROOM,
  ROLES.FINANCE_OFFICER,
  ROLES.HR_OFFICER,
  ROLES.ADMIN_OPS,
  ROLES.FIELD_OPS,
  ROLES.MAINTENANCE,
  ROLES.TRANSFER_STATION,
  ROLES.DISCLOSURES_OFFICER,
  ROLES.COMPLAINTS_OFFICER,
  ROLES.DEPARTMENT_MANAGER,
  ROLES.EMPLOYEE,
] as const

/** التسميات العربية للأدوار — للشارات والقوائم */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  employee: 'موظف',
  hr_officer: 'موارد بشرية',
  department_manager: 'مسؤول قسم',
  finance_officer: 'مالية',
  it_admin: 'تقنية معلومات',
  super_admin: 'مدير مفوض',
  field_ops: 'عمليات ميدانية',
  admin_ops: 'عمليات إدارية',
  maintenance: 'صيانة',
  transfer_station: 'محطة تحويلية',
  executive_director: 'مدير تنفيذي',
  deputy_director: 'معاون المدير المفوض',
  ops_room: 'غرفة عمليات',
  disclosures_officer: 'وحدة الكشوفات',
  complaints_officer: 'مسؤول الشكاوى',
} as const
