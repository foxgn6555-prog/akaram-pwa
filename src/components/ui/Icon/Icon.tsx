/**
 * أيقونات SVG مضمّنة (بأسلوب lucide المبسط) — لا اعتماد خارجي إطلاقاً:
 * تعمل offline وتتوافق مع CSP الصارم (لا CDN خطوط/أيقونات).
 */
import type { SVGProps } from 'react'

export type IconName =
  | 'home' | 'user' | 'users' | 'file-text' | 'wallet' | 'folder'
  | 'clipboard' | 'calendar' | 'bar-chart' | 'check-square' | 'pie-chart'
  | 'life-buoy' | 'box' | 'shield' | 'settings' | 'database'
  | 'layout-grid' | 'logout' | 'menu' | 'x' | 'bell' | 'eye' | 'eye-off'
  | 'chevron-left' | 'chevron-right' | 'lock' | 'wifi-off'
  | 'user-plus' | 'activity' | 'list' | 'alert-triangle' | 'refresh' | 'search'
  | 'fingerprint' | 'map-pin' | 'truck' | 'flow'

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20.5c1.6-3.6 4.2-5.2 7.5-5.2s5.9 1.6 7.5 5.2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c1.4-3.2 3.6-4.7 6.2-4.7s4.8 1.5 6.2 4.7" /><path d="M16 5.4a3.2 3.2 0 0 1 0 5.9" /><path d="M17.8 15.6c1.6.6 2.8 2 3.6 4.4" /></>,
  'file-text': <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 12h5M10 16h5" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" /></>,
  folder: <><path d="M3 7a2 2 0 0 1 2-2h4.5l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 10h6M9 14h6M9 18h3.5" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 10.5h16" /></>,
  'bar-chart': <><path d="M5 20V13M12 20V6M19 20v-4.5" /></>,
  'check-square': <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="m8.5 12.2 2.4 2.4 4.6-5" /></>,
  'pie-chart': <><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z" /><path d="M15 2.6A8.5 8.5 0 0 1 21.4 9H15z" /></>,
  'life-buoy': <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.8" /><path d="m5.7 5.7 3.7 3.7M18.3 5.7l-3.7 3.7M18.3 18.3l-3.7-3.7M5.7 18.3l3.7-3.7" /></>,
  box: <><path d="m12 2.7 8.5 4.7v9.2L12 21.3l-8.5-4.7V7.4z" /><path d="M3.7 7.6 12 12.2l8.3-4.6" /><path d="M12 12.2v9" /></>,
  shield: <><path d="M12 2.8 19 6v5.2c0 4.9-3.1 7.9-7 9.9-3.9-2-7-5-7-9.9V6z" /></>,
  settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M21.2 12h-3M5.8 12h-3M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1M18.5 18.5l-2.1-2.1M7.6 7.6 5.5 5.5" /></>,
  database: <><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5V18.5c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  'layout-grid': <><rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.5" /><rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.5" /><rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.5" /><rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.5" /></>,
  logout: <><path d="M9.5 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.5" /><path d="m15.5 16.5 4.5-4.5-4.5-4.5" /><path d="M20 12H9.5" /></>,
  menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16" /></>,
  x: <><path d="m5.5 5.5 13 13M18.5 5.5l-13 13" /></>,
  bell: <><path d="M6.3 9.3a5.7 5.7 0 1 1 11.4 0c0 6 2.3 6.7 2.3 6.7H4s2.3-.7 2.3-6.7" /><path d="M10.4 20a1.8 1.8 0 0 0 3.2 0" /></>,
  eye: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  'eye-off': <><path d="M4 4l16 16" /><path d="M10.6 6a10 10 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a16.7 16.7 0 0 1-3 3.6M6.6 6.8A16 16 0 0 0 2.5 12S6 18.1 12 18.1a9.7 9.7 0 0 0 4.3-1" /><path d="M9.9 9.9a2.8 2.8 0 0 0 4 4" /></>,
  'chevron-left': <><path d="m14.5 6-6 6 6 6" /></>,
  'chevron-right': <><path d="m9.5 6 6 6-6 6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  'wifi-off': <><path d="m2 2 20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 12.5a12 12 0 0 1 4-2.6M19 12.5a12 12 0 0 0-6.5-3.3" /><path d="M12 20h.01" /></>,
  'user-plus': <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20c1.4-3.2 3.6-4.7 6.2-4.7s4.8 1.5 6.2 4.7" /><path d="M18.5 8v6M15.5 11h6" /></>,
  activity: <><path d="M3 12h4l2.5-7 4.5 14 2.5-7H21" /></>,
  list: <><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20" /><path d="M4 6.5h.01M4 12h.01M4 17.5h.01" /></>,
  'alert-triangle': <><path d="M12 3.5 22 20H2z" /><path d="M12 9.5v4.5M12 17h.01" /></>,
  refresh: <><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M20.5 3.5V8H16" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  fingerprint: <><path d="M12 11.5a3 3 0 0 0-3 3c0 2.5-.5 4.5-1.5 6" /><path d="M15 14.5c0 3-.3 5.5-1 7.5" /><path d="M6.2 8.5A7 7 0 0 1 12 5.5a7 7 0 0 1 5.8 3" /><path d="M3.5 12.5c.5-1.5 1-2.5 1.5-3.3" /><path d="M19 9.2c1 1.5 1.8 3.5 2 6.3" /><path d="M9 14.5c0-1.7 1.3-3 3-3s3 1.3 3 3c0 2.3-.3 4.6-.8 6.5" /></>,
  'map-pin': <><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.8" /></>,
  truck: <><path d="M2 6h12v10H2z" /><path d="M14 9h4l3 3.5V16h-7" /><circle cx="6" cy="18.5" r="1.8" /><circle cx="17.5" cy="18.5" r="1.8" /></>,
  flow: <><path d="M4 12h5m6 0h5" /><path d="M9 8l-3 4 3 4" /><path d="M15 8l3 4-3 4" /></>,
}

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
