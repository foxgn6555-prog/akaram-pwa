const encoder = new TextEncoder()

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

/** تحقق توقيع Mailgun: HMAC-SHA256(timestamp + token). */
export async function verifyMailgunSignature(
  timestamp: string,
  token: string,
  signature: string,
  signingKey: string,
): Promise<boolean> {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) return false
  // منع replay لطلبات أقدم من 15 دقيقة أو تواريخ مستقبلية بعيدة.
  if (Math.abs(Date.now() / 1000 - seconds) > 900) return false

  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(signingKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const calculated = bytesToHex(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(timestamp + token))),
  )
  return constantTimeEqual(calculated, signature.toLowerCase())
}

export function safeFileName(name: string): string {
  return name.normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 140) || 'attachment'
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}
