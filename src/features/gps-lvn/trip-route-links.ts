/** 00347: مسارات الانطلاقيات تعيش داخل وحدة «بيانات أجهزة GPS» (تبويب) — لا صفحة ولا بند جانبي مستقل. */
export const TRIP_ROUTES_HREF = '/ops-room/gps?view=trips'
export const tripMapHref = (departureId: string, compareId?: string | null) =>
  `${TRIP_ROUTES_HREF}&trip=${encodeURIComponent(departureId)}${compareId ? `&compare=${encodeURIComponent(compareId)}` : ''}`
