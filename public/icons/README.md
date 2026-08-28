# أيقونات PWA المطلوبة

| الملف | الحجم | الغرض |
|-------|-------|-------|
| `icon-192.png` | 192×192 | أيقونة عامة |
| `icon-512.png` | 512×512 | أيقونة عامة + Splash |
| `icon-maskable-512.png` | 512×512 | Maskable (محتوى داخل 80% الأوسط — safe zone) |
| `favicon.ico` | — | تبويب المتصفح |

توليد سريع: صمّم الشعار بمقاس 1024×1024 ثم:
`npx @pwa/assets-generator logo.svg --preset minimal-2023`
