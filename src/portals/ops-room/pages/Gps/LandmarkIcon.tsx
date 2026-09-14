/* eslint-disable react-refresh/only-export-components -- خريطة الرموز ومصنع Leaflet مشتركان مع منتقي المعالم. */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import L from 'leaflet'
import type { GpsLandmarkIcon } from '@sdk/gps-lvn.sdk'
import {
  Building2,
  Cctv,
  CircleParking,
  Construction,
  Crosshair,
  Droplets,
  Flag,
  Flower2,
  Fuel,
  GraduationCap,
  Hospital,
  Landmark,
  MapPin,
  ShieldCheck,
  Store,
  Trash2,
  Trees,
  TriangleAlert,
  Utensils,
  Warehouse,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export const landmarkIconLabels = {
  pin: 'دبوس موقع',
  building: 'مبنى',
  garage: 'كراج',
  fuel: 'وقود',
  maintenance: 'صيانة',
  warehouse: 'مخزن',
  office: 'دائرة رسمية',
  checkpoint: 'نقطة سيطرة',
  warning: 'موقع خطورة',
  trash: 'نفايات',
  tree: 'أشجار',
  park: 'حديقة',
  hospital: 'مركز صحي',
  school: 'مدرسة',
  restaurant: 'مطعم',
  water: 'ماء',
  camera: 'كاميرا',
  parking: 'موقف',
  toilet: 'مرافق',
  bridge: 'أعمال طريق',
  target: 'نقطة هدف',
  flag: 'علامة',
} as const satisfies Record<GpsLandmarkIcon, string>

const icons: Record<GpsLandmarkIcon, LucideIcon> = {
  pin: MapPin,
  building: Building2,
  garage: Store,
  fuel: Fuel,
  maintenance: Wrench,
  warehouse: Warehouse,
  office: Landmark,
  checkpoint: ShieldCheck,
  warning: TriangleAlert,
  trash: Trash2,
  tree: Trees,
  park: Flower2,
  hospital: Hospital,
  school: GraduationCap,
  restaurant: Utensils,
  water: Droplets,
  camera: Cctv,
  parking: CircleParking,
  toilet: Building2,
  bridge: Construction,
  target: Crosshair,
  flag: Flag,
}

export function LandmarkGlyph({ icon, size = 18 }: { icon: GpsLandmarkIcon; size?: number }) {
  const Component = icons[icon] ?? MapPin
  return <Component size={size} strokeWidth={2.2} aria-hidden="true" />
}

const cache = new Map<string, L.DivIcon>()
export function landmarkDivIcon(icon: GpsLandmarkIcon, color: string) {
  const key = `${icon}:${color}`
  const saved = cache.get(key)
  if (saved) return saved
  const glyph = renderToStaticMarkup(createElement(LandmarkGlyph, { icon, size: 19 }))
  const result = L.divIcon({
    className: 'gps-landmark-div-icon',
    html: `<span style="display:grid;width:38px;height:38px;place-items:center;border-radius:999px;background:${color};color:#fff;border:3px solid #fff;box-shadow:0 5px 16px rgba(15,23,42,.35)">${glyph}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  })
  cache.set(key, result)
  return result
}
