# ADR 004 — PWA عبر vite-plugin-pwa + Workbox injectManifest

**الحالة:** مقبول · **التاريخ:** 2026-08

## القرار
- `strategies: 'injectManifest'` مع SW مخصص `src/workers/sw.ts` — لا SW يدوي خارجه.
- App Shell بـ NavigationRoute مع fallback لـ `offline.html`.
- **لا كاش لأي مسار Supabase** (`/rest/v1`, `/auth/v1`) — بيانات حساسة NetworkOnly.
- إعداد PWA في مكان واحد: `src/config/pwa.config.ts` يستهلكه `vite.config.ts`.
- **حُذف `public/manifest.json`** (كان في v3 تعارضاً) — المانيفست يولَّد من الـ config.

## النتيجة
أوفلاين موثوق للقشرة، صفر تسريب بيانات للكاش، إعداد واحد بلا تكرار.
