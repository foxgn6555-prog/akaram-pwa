-- ═══════════════════════════════════════════════════════════════
-- 00031 · توسيع قيد عمليات التدقيق: ARCHIVE · RESTORE (منظومة الأرشيف)
-- ═══════════════════════════════════════════════════════════════

alter table public.audit_logs drop constraint audit_logs_operation_check;
alter table public.audit_logs add constraint audit_logs_operation_check
  check (operation in ('INSERT','UPDATE','DELETE','ARCHIVE','RESTORE'));
