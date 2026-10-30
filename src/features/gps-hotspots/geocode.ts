/** 00385 — أقرب عنوان لبقعة (Nominatim/OpenStreetMap، بالعربية، مع ذاكرة محلية لكل إحداثي) — يفشل بهدوء إلى الإحداثيات */
const cache = new Map<string, string | null>()
const key = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`
export function pickAddress(a: Record<string, string | undefined> | undefined, displayName?: string): string | null {
  if (!a) return displayName?.split(',').slice(0, 3).join('،') ?? null
  const parts = [a.road ?? a.pedestrian ?? a.footway, a.neighbourhood ?? a.suburb ?? a.quarter ?? a.residential, a.city_district ?? a.city ?? a.town ?? a.village].filter(Boolean)
  return parts.length ? parts.join(' — ') : (displayName?.split(',').slice(0, 3).join('،') ?? null)
}
export async function reverseGeocode(lat: number, lng: number, fetcher: typeof fetch = fetch): Promise<string | null> {
  const k = key(lat, lng)
  if (cache.has(k)) return cache.get(k) ?? null
  try {
    const r = await fetcher(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=ar`, { headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(String(r.status))
    const j = (await r.json()) as { address?: Record<string, string | undefined>; display_name?: string }
    const out = pickAddress(j.address, j.display_name)
    cache.set(k, out)
    return out
  } catch { cache.set(k, null); return null }
}
export const __geocodeCacheForTests = cache
