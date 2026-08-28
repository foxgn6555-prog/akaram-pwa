/** mirror لـ 00025_integrations.sql */
export interface BiometricDevice {
  id: string
  serial_number: string
  name: string
  branch_id: string | null
  location_hint: string | null
  is_active: boolean
  last_seen_at: string | null
  firmware: string | null
}

export interface CreateDeviceInput {
  serial_number: string
  name: string
  branch_id?: string
  location_hint?: string
}

export interface GpsProvider {
  id: string
  name: string
  type: 'traccar' | 'osmand' | 'custom_webhook' | 'vendor_api'
  api_key: string | null
  webhook_url: string | null
  is_active: boolean
}

export interface Vehicle {
  id: string
  plate: string
  name: string
  branch_id: string | null
  gps_provider_id: string | null
  device_unique_id: string | null
  is_active: boolean
}

export interface VehiclePosition {
  id: number
  vehicle_id: string
  latitude: number
  longitude: number
  speed_kmh: number | null
  heading: number | null
  ignition: boolean | null
  fix_time: string
}

export interface IntegrationLog {
  id: number
  provider: string
  direction: 'inbound' | 'outbound'
  status: 'success' | 'error' | 'rejected'
  endpoint: string | null
  error_note: string | null
  created_at: string
}

export interface CreateVehicleInput {
  plate: string
  name: string
  branch_id?: string
  gps_provider_id?: string
  device_unique_id?: string
}
