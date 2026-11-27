/** حضوريات ورواتب الآليات المؤجرة — استعلامات وطفرات (20261203000100–000400) */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  rentedAttendance,
  rentedErrorMessage,
  type RentedDayState,
  type RentedSalaryMode,
  type RentedTaxMode,
} from '@sdk/rented-vehicles.sdk'
import { useUiStore } from '@stores/ui.store'
import { handleAppError } from '@lib/errors/error.handler'

export const rentedKeys = {
  all: ['rented-vehicles'] as const,
  month: (m: string | null, g: string | null) => [...rentedKeys.all, 'month', m, g] as const,
  garages: () => [...rentedKeys.all, 'garages'] as const,
  discharge: () => [...rentedKeys.all, 'discharge'] as const,
  tax: () => [...rentedKeys.all, 'tax'] as const,
  payroll: (m: string | null) => [...rentedKeys.all, 'payroll', m] as const,
  audit: () => [...rentedKeys.all, 'audit'] as const,
}

const useAction = <T>(fn: (x: T) => Promise<void>, message: string) => {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.addToast)
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rentedKeys.all })
      toast({ type: 'success', message })
    },
    onError: (e) => {
      handleAppError(e, { scope: 'rented-vehicles' })
      toast({ type: 'error', message: rentedErrorMessage(e) })
    },
  })
}

// ── قراءة ──
export const useRentedMonth = (month: string | null, garage: string | null) =>
  useQuery({
    queryKey: rentedKeys.month(month, garage),
    queryFn: () => rentedAttendance.month(month, garage),
    staleTime: 30_000,
  })
export const useRentedGarages = () =>
  useQuery({
    queryKey: rentedKeys.garages(),
    queryFn: () => rentedAttendance.garages(),
    staleTime: 120_000,
  })
export const useRentedDischarge = () =>
  useQuery({
    queryKey: rentedKeys.discharge(),
    queryFn: () => rentedAttendance.dischargeList(),
    staleTime: 30_000,
  })
export const useRentedTaxes = () =>
  useQuery({
    queryKey: rentedKeys.tax(),
    queryFn: () => rentedAttendance.taxList(),
    staleTime: 30_000,
  })
export const useRentedPayroll = (month: string | null) =>
  useQuery({
    queryKey: rentedKeys.payroll(month),
    queryFn: () => rentedAttendance.payroll(month),
    staleTime: 30_000,
  })

// ── كتابة ──
export const useSetRentedDay = () =>
  useAction<{
    driverId: string
    vehicleId: string
    day: string
    status: RentedDayState
    reason: string
  }>(rentedAttendance.setDay, 'حُفظ تعديل اليوم')

export const useSaveDischarge = () =>
  useAction<{
    vehicleId: string
    tonsPerTrip: number | null
    monthlyTargetTons: number
    note: string | null
  }>(rentedAttendance.dischargeSave, 'حُفظت إعدادات التفريغ')

export const useSubmitRentedMonth = () =>
  useAction<{ month: string }>(
    (v) => rentedAttendance.submitMonth(v.month),
    'أُرسلت الحضوريات للاعتماد',
  )

export const useSaveRentedTax = () =>
  useAction<{ vehicleId: string; mode: RentedTaxMode; amount: number; reason: string }>(
    rentedAttendance.taxSave,
    'حُفظت ضريبة الآلية',
  )

export const useClearRentedTax = () =>
  useAction<{ vehicleId: string; reason: string }>(rentedAttendance.taxClear, 'أُلغيت ضريبة الآلية')

export const useDecideRentedDeputy = () =>
  useAction<{ month: string; approve: boolean; note: string | null }>(
    rentedAttendance.decideDeputy,
    'سُجّل قرار المعاون',
  )

export const useSaveRentedSalary = () =>
  useAction<{
    driverId: string
    vehicleId: string
    month: string
    mode: RentedSalaryMode
    amount: number
    note: string | null
  }>(rentedAttendance.salarySave, 'حُفظ راتب السائق')

export const usePayRentedMonth = () =>
  useAction<{ month: string; note: string | null }>(rentedAttendance.payMonth, 'صُرف الشهر وأُغلق')
