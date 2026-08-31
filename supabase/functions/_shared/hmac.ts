/**
 * تحقق HMAC-SHA256 لتواقيع الـ webhooks الواردة.
 * السر يُقرأ من متغيّر البيئة WEBHOOK_SECRET (يُضبط عبر `supabase secrets set`).
 * صيغة التوقيع المتوقعة في الترويسة: hex أو `sha256=<hex>` (متوافقة مع GitHub/Stripe-style).
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** يتحقق أن `signature` هو HMAC-SHA256(rawBody) بالسر السري المضبوط في البيئة. */
export async function verifyHmacSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = Deno.env.get('WEBHOOK_SECRET')
  if (!secret) {
    // لا سر مضبوط في البيئة => نرفض بأمان بدل قبول أي توقيع
    console.error('[hmac] WEBHOOK_SECRET غير مضبوط — رفض الطلب')
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expectedHex = toHex(digest)

  const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature
  return timingSafeEqual(provided.toLowerCase(), expectedHex.toLowerCase())
}
