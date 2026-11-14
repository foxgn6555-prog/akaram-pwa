# هرم الصلاحيات والحوكمة — المرجع الحاكم

> هذا الملف يوثّق **قرار المستخدم النهائي** بشأن توزيع السلطة، ويُصحّح ما كان متناقضاً في
> `README.md` و`SECURITY.md` و`docs/portals.md` (التي كانت تصف `super_admin` كأعلى سلطة).

## الهرم

```
┌──────────────────────────────────────────────────────────────┐
│ ① تقنية المعلومات — it_admin  ·  بوابة /it                   │
│    السلطة العليا **تقنياً**: إعدادات النظام · الصلاحيات ·     │
│    الحسابات والأدوار · التكاملات · سلامة البيانات · التدقيق  │
│    التقني · تصفير المنصة (باعتماد)                           │
│    ⚠ لا يقرأ بيانات التشغيل: يفتح بوابات المنصة الأخرى       │
│      **عرض تصميم فقط بلا أي بيانات**                         │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ ② المدير المفوض — super_admin  ·  بوابة /admin               │
│    مدير الشركة: **يرى كل بيانات الشركة وتفاصيلها** —         │
│    الموظفون · الحضور · الإجازات · الشكاوى · الأسطول وGPS ·   │
│    الجراج · الإفصاحات · الإعلام · العقود · المالية ·         │
│    سجل التدقيق · الموافقات                                   │
│    لا يُدير الحسابات ولا الأدوار التقنية (ذلك لـIT)          │
└──────────────────────────────────────────────────────────────┘
        ↓ ثم الأدوار التشغيلية: hr · finance · media · complaints ·
          central_garage · ops_room · deputy · executive ·
          transfer_station · maintenance · department_manager ·
          field_ops · admin_ops · follow_up · employee
```

## التنفيذ الفعلي (مُتحقَّق على قاعدة الإنتاج)

| القاعدة | كيف تُفرَض | القياس |
|---|---|---|
| IT سلطة تقنية عليا | `app.can()` يمنح `it_admin` تجاوزاً عاماً (`00371`) | ✅ |
| IT لا يرى بيانات التشغيل | `allowedRoles` + وضع «عرض بلا بيانات» في `src/services/client.ts` (`00415`) | ✅ مُنفَّذ |
| المدير المفوض يرى كل البيانات | `app.is_executive()` = `has_role(['super_admin','executive_director','deputy_director','finance_officer'])` + سياسات RLS | ✅ `exec_overview` و`exec_people` ترجعان 200 ببيانات كاملة لحساب `nn@` |
| المدير المفوض لا يُدير الحسابات | `app.list_platform_users` ترفع `USERS_FORBIDDEN` له | ✅ **مقصود** (وليس عيباً) |
| سجل التدقيق لمدير الشركة فقط | política على `audit_logs` | ✅ 8,952 صفاً لـ`super_admin` · **0** لـ`it_admin` |

## قراءة مقيسة لمدى وصول المدير المفوض (حساب `nn@akram.iq`)

| القطاع | الجدول | صفوف مرئية |
|---|---|---|
| الموظفون | `employees` | 23 |
| الحضور | `attendance_records` | 29 |
| الأسطول | `garage_vehicles` · `vehicles` | 2 · 0 |
| GPS | `gps_devices` · `gps_hotspots` | 112 · 2,622 |
| الإفصاحات | `disclosures` | 4 |
| الإعلام | `media_designs` | 1 |
| المتعهدون | `contractor_profiles` · `contractor_workers` | 1 · 0 |
| السلف | `advances` | 1 |
| الموافقات | `approval_tasks` | 26 |
| التدقيق | `audit_logs` | 8,952 |
| الهيكل | `departments` · `sectors` · `user_roles` | 12 · 8 · 20 |

⇒ **طبقة البيانات تسمح للمدير المفوض بكل شيء**؛ الفجوة إن وُجدت فهي في **الواجهة** لا في الصلاحيات.

## قاعدة يجب احترامها في كل جولة قادمة
1. لا تُمنح `it_admin` قراءة بيانات تشغيل إلا بقرار صريح من المستخدم.
2. لا تُسحب من `super_admin` قدرة القراءة على أي قطاع.
3. لا تُمنح `super_admin` إدارة الحسابات/الأدوار — تبقى لـIT.
4. أي إصلاح يغيّر هذه الحدود **يُسأل عنه المستخدم أولاً**.

---

## قرارات المستخدم — الجولة 3 (2026-11-10)

### 1) التصفير (ق-1) — يُترك على حاله **عن قصد**
> «في حال عدم وجود سلسلة يتم التصفير بشكل مباشر، وفي حال وجود سلسلة يطلب موافقة — اتركه على حاله.»

- **لا تغيير** على `00347_platform_reset_external_cleanup.sql` / `00344_platform_reset.sql`.
- السلوك المقصود: غياب سلسلة موافقة ⇒ تنفيذ مباشر بعد الموافقة؛ وجود سلسلة ⇒ المرور بخطواتها.
- ⚠️ هذا استثناء صريح من قاعدة «الأمان أولاً» في `SECURITY.md` — أي تعديل مستقبلي عليه يحتاج قراراً جديداً من المستخدم، ولا يُعاد فتحه تلقائياً.

### 2) سحب صلاحيات الكتابة من `it_admin` (على مستوى القاعدة)
الترحيل: `supabase/migrations/20261110120000_revoke_it_admin_operational_writes.sql`

السحب **محدود بالبيانات التشغيلية** التي لا تُكتب من أي شاشة في `/it` (تحقق بالكود قبل التنفيذ):

| الجدول | السياسات المسحوبة | من يبقى |
|---|---|---|
| `garage_user_profiles` | ALL | `super_admin` |
| `parent_sectors` | ALL | `super_admin` |
| `sector_workers` | INSERT / UPDATE | `super_admin` · `hr_officer` · `department_manager` (على قاطعه) |
| `sector_workers` | DELETE | `super_admin` |
| `sector_supply_requests` | UPDATE | صاحب الطلب · `super_admin` · `deputy_director` |

**لم يُمسّ** (صلاحيات تقنية لبوابة IT ولها شاشات حيّة في `/it`): `branches` · `departments` · `sectors` ·
`manager_profiles` (بطاقة مدير القاطع في `UserDetail`) · `sector_vehicles` (`GpsPage`) · `portal_units` ·
`dynamic_portals` · `system_settings` · `role_page_permissions` · `user_page_overrides` · `biometric_devices` ·
`biometric_adms_endpoints` · `gps_providers` · `vehicles` · `app_errors` · `it_assets` · `it_tickets`.

**سياسات القراءة لم تُمسّ** (3 سياسات) — القراءة يحكمها حجب الواجهة (ADR 002 `computePreviewMode`).
