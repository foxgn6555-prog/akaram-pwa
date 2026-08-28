-- ═══ اختبارات الـ Triggers ═══
begin;
select plan(12);

-- 1) workflow: pending → approved ينجح لمدير ويفشل لموظف عادي
-- 2) workflow: pending → completed يرفض دائماً (انتقال غير مشروع)
-- 3) version bump: كل update يرفع version بمقدار 1
-- 4) audit: أي update على employees يولّد سجل audit_log مع changed_fields
-- 5) notification: تغيير حالة الطلب يولّد إشعاراً لصاحبه

select * from finish();
rollback;
