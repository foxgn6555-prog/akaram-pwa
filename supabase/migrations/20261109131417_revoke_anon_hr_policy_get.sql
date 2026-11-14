-- Prevent unauthenticated callers from reading internal HR policy settings.
-- Preserve application access for authenticated users and backend access for service_role.
REVOKE EXECUTE ON FUNCTION public.hr_policy_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_policy_get() TO authenticated, service_role;

-- Fail the migration if the intended ACL is not in effect.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.hr_policy_get()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL assertion failed: anon still has EXECUTE on public.hr_policy_get()';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.hr_policy_get()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL assertion failed: authenticated lost EXECUTE on public.hr_policy_get()';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.hr_policy_get()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL assertion failed: service_role lost EXECUTE on public.hr_policy_get()';
  END IF;
END
$$;
