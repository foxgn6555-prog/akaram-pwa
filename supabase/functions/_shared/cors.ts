/** CORS headers — قائمة سماح صريحة، لا wildcard في production */
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'http://localhost:5173,https://akram.example.iq')
  .split(',')

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function handleCors(req: Request): Response | null {
  const origin = req.headers.get('origin') ?? ''
  if (!ALLOWED_ORIGINS.includes(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = ALLOWED_ORIGINS[0] ?? ''
  } else {
    corsHeaders['Access-Control-Allow-Origin'] = origin
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}
