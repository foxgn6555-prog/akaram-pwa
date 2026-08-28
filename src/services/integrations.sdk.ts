/** SDK التكاملات: بصمة + GPS + سجل (00025) */
import { sdkGuard, sdkVoid, supabase } from './client'
import type {
  BiometricDevice, CreateDeviceInput,
  GpsProvider, Vehicle, VehiclePosition, IntegrationLog, CreateVehicleInput,
} from '@features/integrations/types'

export const integrations = {
  // ── البصمة ──
  async listDevices(): Promise<BiometricDevice[]> {
    return sdkGuard(
      supabase
        .from('biometric_devices')
        .select('id, serial_number, name, branch_id, location_hint, is_active, last_seen_at, firmware')
        .order('name'),
    ) as Promise<BiometricDevice[]>
  },

  async createDevice(input: CreateDeviceInput): Promise<BiometricDevice> {
    return sdkGuard(
      supabase
        .from('biometric_devices')
        .insert(input as never)
        .select('id, serial_number, name, branch_id, location_hint, is_active, last_seen_at, firmware')
        .single(),
    ) as Promise<BiometricDevice>
  },

  async setDeviceActive(id: string, is_active: boolean): Promise<void> {
    await sdkVoid(
      supabase.from('biometric_devices').update({ is_active } as never).eq('id', id),
    )
  },

  /** رابط الخادم الذي يُدخل في إعدادات الجهاز (ADMS) */
  getAdmsServerUrl(): string {
    const base = import.meta.env.VITE_SUPABASE_URL
    return `${base}/functions/v1/adms-receiver`
  },

  // ── GPS ──
  async listProviders(): Promise<GpsProvider[]> {
    return sdkGuard(
      supabase
        .from('gps_providers')
        .select('id, name, type, api_key, webhook_url, is_active')
        .order('name'),
    ) as Promise<GpsProvider[]>
  },

  async createProvider(name: string, type: GpsProvider['type'], apiKey?: string): Promise<GpsProvider> {
    return sdkGuard(
      supabase
        .from('gps_providers')
        .insert({ name, type, api_key: apiKey ?? null } as never)
        .select('id, name, type, api_key, webhook_url, is_active')
        .single(),
    ) as Promise<GpsProvider>
  },

  async listVehicles(): Promise<Vehicle[]> {
    return sdkGuard(
      supabase
        .from('vehicles')
        .select('id, plate, name, branch_id, gps_provider_id, device_unique_id, is_active')
        .order('plate'),
    ) as Promise<Vehicle[]>
  },

  async createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    return sdkGuard(
      supabase
        .from('vehicles')
        .insert(input as never)
        .select('id, plate, name, branch_id, gps_provider_id, device_unique_id, is_active')
        .single(),
    ) as Promise<Vehicle>
  },

  /** آخر موقع لكل مركبة */
  async latestPositions(): Promise<VehiclePosition[]> {
    return sdkGuard(
      supabase
        .from('vehicle_positions')
        .select('id, vehicle_id, latitude, longitude, speed_kmh, heading, ignition, fix_time')
        .order('fix_time', { ascending: false })
        .limit(200),
    ) as Promise<VehiclePosition[]>
  },

  // ── السجل ──
  async listLogs(provider?: string, limit = 100): Promise<IntegrationLog[]> {
    let query = supabase
      .from('integration_logs')
      .select('id, provider, direction, status, endpoint, error_note, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (provider) query = query.eq('provider', provider)
    return sdkGuard(query) as Promise<IntegrationLog[]>
  },
}
