/** خطافات البصمة (00139) — تقني (IT) + بيانات (HR) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { integrationsKeys } from '@lib/query-keys/integrations.keys'
import { biometric, biometricErrorMessage } from '@sdk/biometric.sdk'
import { API } from '@lib/constants/api.constants'
import { useUiStore } from '@stores/ui.store'
import type { BiometricDeviceConfig, BiometricMode, BiometricPunchFilters } from '../types'

export function useBiometricPulls(deviceId?: string | null) {
  return useQuery({
    queryKey: integrationsKeys.pulls(deviceId),
    queryFn: () => biometric.listPulls(deviceId),
    staleTime: 10_000,
  })
}

export function useBiometricPunches(filters: BiometricPunchFilters, enabled = true) {
  return useQuery({
    queryKey: integrationsKeys.punches(filters),
    queryFn: () => biometric.listPunches(filters),
    staleTime: API.STALE_TIME.DEFAULT,
    enabled,
  })
}

export function useBiometricDeviceUsers(search?: string, enabled = true) {
  return useQuery({
    queryKey: [...integrationsKeys.all, 'bio-device-users', search ?? ''] as const,
    queryFn: () => biometric.listDeviceUsers(search),
    staleTime: API.STALE_TIME.DEFAULT,
    enabled,
  })
}

function useInvalidateBiometric() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: integrationsKeys.devices() })
    void qc.invalidateQueries({ queryKey: [...integrationsKeys.all, 'bio-pulls'] })
    void qc.invalidateQueries({ queryKey: [...integrationsKeys.all, 'bio-punches'] })
  }
}

export function useUpdateBiometricDevice() {
  const invalidate = useInvalidateBiometric()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { id: string; name?: string; mode?: BiometricMode; config?: BiometricDeviceConfig; location_hint?: string | null; timezone_offset?: string }) =>
      biometric.updateDevice(v.id, { name: v.name, mode: v.mode, config: v.config, location_hint: v.location_hint, timezone_offset: v.timezone_offset }),
    onSuccess: () => { invalidate(); addToast({ type: 'success', message: 'حُفظت إعدادات المصدر' }) },
    onError: (e) => addToast({ type: 'error', message: biometricErrorMessage(e) }),
  })
}

export function useRotateBridgeKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deviceId: string) => biometric.rotateBridgeKey(deviceId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: integrationsKeys.devices() }) },
  })
}

export function useTestBiometricSource() {
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { deviceId: string; from?: string; to?: string }) => biometric.testSource(v.deviceId, v.from, v.to),
    onError: (e) => addToast({ type: 'error', message: biometricErrorMessage(e) }),
  })
}

export function usePullBiometric() {
  const invalidate = useInvalidateBiometric()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { deviceId: string; from?: string; to?: string }) => biometric.pull(v.deviceId, v.from, v.to),
    onSuccess: (r) => {
      invalidate()
      addToast({ type: 'success', message: `اكتمل السحب: ${r.received} مستلَم · ${r.inserted} جديد · ${r.duplicates} مكرر · ${r.unmatched} غير مطابَق` })
    },
    onError: (e) => { invalidate(); addToast({ type: 'error', message: biometricErrorMessage(e) }) },
  })
}

export function useImportBiometricPunches() {
  const invalidate = useInvalidateBiometric()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { deviceId: string; logs: Array<{ pin: string; at: string; direction?: string; name?: string }>; method?: string }) =>
      biometric.importPunches(v.deviceId, v.logs, v.method),
    onSuccess: (r) => {
      invalidate()
      addToast({ type: 'success', message: `استيراد: ${r.inserted} جديد · ${r.duplicates} مكرر · ${r.unmatched} غير مطابَق` })
    },
    onError: (e) => addToast({ type: 'error', message: biometricErrorMessage(e) }),
  })
}

export function useProcessBiometricPushes() {
  const invalidate = useInvalidateBiometric()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (limit?: number) => biometric.processPushes(limit),
    onSuccess: (n) => { invalidate(); addToast({ type: 'success', message: `عولجت ${n} بصمة من دفعات ADMS إلى الدفتر` }) },
    onError: (e) => addToast({ type: 'error', message: biometricErrorMessage(e) }),
  })
}

export function useLinkBiometricPin() {
  const invalidate = useInvalidateBiometric()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (v: { pin: string; employeeId: string }) => biometric.linkPin(v.pin, v.employeeId),
    onSuccess: () => { invalidate(); addToast({ type: 'success', message: 'رُبط رقم البصمة بالموظف وحُدِّثت بصماته السابقة' }) },
    onError: (e) => addToast({ type: 'error', message: biometricErrorMessage(e) }),
  })
}

export function useDeriveAttendance() {
  const qc = useQueryClient()
  const addToast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: (date: string) => biometric.deriveAttendance(date),
    onSuccess: (n) => {
      void qc.invalidateQueries({ queryKey: ['attendance'] })
      addToast({ type: 'success', message: n === 0 ? 'لا بصمات مطابَقة لهذا اليوم' : `حُدِّث حضور ${n} موظفاً من البصمات` })
    },
    onError: (e) => addToast({ type: 'error', message: biometricErrorMessage(e) }),
  })
}
