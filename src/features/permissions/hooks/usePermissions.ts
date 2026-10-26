/** 00350 — خطافات إدارة الصلاحيات (التطوير المركزية): قوالب، إسناد، استثناءات، معاينة فعلية، تدقيق */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { permissionsKeys } from '@lib/query-keys/permissions.keys'
import { permissionErrorMessage, permissions } from '@sdk/permissions.sdk'
import type { PermissionEffect } from '@sdk/permissions.sdk'
import type { PermissionAction } from '@config/permission-catalog'
import { useUiStore } from '@stores/ui.store'

function useToast() {
  const addToast = useUiStore((s) => s.addToast)
  return { ok: (message: string) => addToast({ type: 'success', message }), err: (e: unknown) => addToast({ type: 'error', message: permissionErrorMessage(e) }) }
}
function useInvalidateAll() { const qc = useQueryClient(); return () => { void qc.invalidateQueries({ queryKey: permissionsKeys.all }) } }

export function usePermissionTemplates() { return useQuery({ queryKey: permissionsKeys.templates(), queryFn: permissions.templates, staleTime: 60_000 }) }
export function usePermissionTemplateRules(templateId: string | null) {
  return useQuery({ queryKey: permissionsKeys.templateRules(templateId ?? ''), queryFn: () => permissions.templateRules(templateId as string), enabled: !!templateId })
}
export function useSavePermissionTemplate() {
  const inv = useInvalidateAll(); const t = useToast()
  return useMutation({ mutationFn: (v: { id?: string; name: string; description?: string | null; is_active?: boolean }) => permissions.templateSave(v), onSuccess: () => { inv(); t.ok('حُفظ القالب') }, onError: t.err })
}
export function useSetPermissionTemplateRules() {
  const inv = useInvalidateAll(); const t = useToast()
  return useMutation({ mutationFn: (v: { templateId: string; rules: Array<{ unit_key: string; action: PermissionAction; effect: PermissionEffect }> }) => permissions.templateRulesSet(v.templateId, v.rules), onSuccess: () => { inv(); t.ok('حُفظت قواعد القالب — تسري فوراً على كل المستخدمين المسنَدين') }, onError: t.err })
}
export function useDeletePermissionTemplate() {
  const inv = useInvalidateAll(); const t = useToast()
  return useMutation({ mutationFn: (templateId: string) => permissions.templateDelete(templateId), onSuccess: () => { inv(); t.ok('حُذف القالب') }, onError: t.err })
}
export function useUserPermissionTemplate(userId: string) { return useQuery({ queryKey: permissionsKeys.userTemplate(userId), queryFn: () => permissions.userTemplate(userId), enabled: !!userId }) }
export function useSetUserPermissionTemplate() {
  const inv = useInvalidateAll(); const t = useToast()
  return useMutation({ mutationFn: (v: { userId: string; templateId: string | null }) => permissions.userTemplateSet(v.userId, v.templateId), onSuccess: (_d, v) => { inv(); t.ok(v.templateId ? 'أُسنِد القالب — يسري عند تحديث صفحة المستخدم' : 'أُزيل القالب — عاد إلى افتراضي دوره') }, onError: t.err })
}
export function useUserPermissionOverrides(userId: string) { return useQuery({ queryKey: permissionsKeys.userOverrides(userId), queryFn: () => permissions.userOverrides(userId), enabled: !!userId }) }
export function useSetUserPermissionOverride() {
  const inv = useInvalidateAll(); const t = useToast()
  return useMutation({ mutationFn: (v: { userId: string; unit: string; action: PermissionAction; effect: PermissionEffect | null; reason?: string | null }) => permissions.userOverrideSet(v.userId, v.unit, v.action, v.effect, v.reason ?? null), onSuccess: (_d, v) => { inv(); t.ok(v.effect === null ? 'أُزيل الاستثناء' : v.effect === 'allow' ? 'أُضيف استثناء «مسموح»' : 'أُضيف استثناء «ممنوع»') }, onError: t.err })
}
export function useUserEffectivePermissions(userId: string) { return useQuery({ queryKey: permissionsKeys.userEffective(userId), queryFn: () => permissions.userEffective(userId), enabled: !!userId }) }
export function usePermissionAudit(userId: string | null, templateId: string | null, enabled = true) {
  return useQuery({ queryKey: permissionsKeys.audit(userId, templateId), queryFn: () => permissions.audit(userId, templateId, 100), enabled })
}
