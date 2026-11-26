/**
 * 00410 — فصل «زونات المنصة» عن «زونات المزوّد» على الخريطة.
 *
 * ## المشكلة التي تحلّها
 * المزامنة الكاملة (`lvn-gps-sync` بـ `action=full`) تستورد حدود مناطق LVN
 * إلى `gps_geofences` بعمود `source='lvn'`. كانت كل شاشات الخريطة ترسم
 * `source='lvn'` و`source='platform'` في **طبقة واحدة** بلا تمييز، فظهرت
 * حدود مزوّد GPS متداخلة فوق قواطع المنصة التشغيلية — والنتيجة خريطة
 * لا يمكن قراءتها: حدّان لونيان متقاطعان لنفس الشارع.
 *
 * ## القرار (طلب المستخدم)
 * «أريد زونات منصتي فقط، لا أريد عرض زونات المزوّد.» ⇒ الافتراضي صار
 * **إخفاء زونات المزوّد** في كل خريطة، مع مفتاح صريح لإظهارها لمن يحتاجها
 * (مراجعة تطابق الحدود مع LVN) — لا إسقاط للبيانات ولا حذفها، عرض فقط.
 *
 * ## ما لا تفعله
 * لا تغيّر `gps_geofences` ولا منطق التنبيهات (`outside_zone`) — الزونات
 * المستوردة تبقى صالحة للإسناد والمراقبة كما هي؛ هذا قرار رسم على الخريطة.
 */
import type { GpsMapGeofence } from '@sdk/gps-lvn.sdk'

/** زونات المنصة التشغيلية فقط — الافتراضي في كل خريطة */
export const isPlatformZone = (zone: Pick<GpsMapGeofence, 'source'>) => zone.source === 'platform'

/**
 * ترشيح الزونات المعروضة على الخريطة.
 * @param zones كل الزونات القادمة من `gps_lvn_map_geofences`
 * @param showProviderZones إظهار زونات المزوّد أيضاً (مطفأ افتراضياً)
 */
export function visibleZones<T extends Pick<GpsMapGeofence, 'source'>>(
  zones: readonly T[],
  showProviderZones: boolean,
): T[] {
  return showProviderZones ? [...zones] : zones.filter(isPlatformZone)
}
