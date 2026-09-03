export async function compareImageContext(beforeUrl: string, afterUrl: string): Promise<number | null> {
  try {
    const [before, after] = await Promise.all([sample(beforeUrl), sample(afterUrl)])
    const meanA = before.reduce((sum, value) => sum + value, 0) / before.length
    const meanB = after.reduce((sum, value) => sum + value, 0) / after.length
    let dot = 0; let normA = 0; let normB = 0
    for (let index = 0; index < before.length; index += 1) {
      const a = (before[index] ?? 0) - meanA; const b = (after[index] ?? 0) - meanB
      dot += a * b; normA += a * a; normB += b * b
    }
    if (!normA || !normB) return null
    return Math.max(0, Math.min(100, Math.round(((dot / Math.sqrt(normA * normB)) + 1) * 50)))
  } catch { return null }
}
async function sample(url: string): Promise<number[]> {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url
  await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('CANVAS_UNAVAILABLE')
  context.drawImage(image, 0, 0, 16, 16)
  const pixels = context.getImageData(0, 0, 16, 16).data; const values: number[] = []
  for (let index = 0; index < pixels.length; index += 4) values.push((pixels[index] ?? 0) * .299 + (pixels[index + 1] ?? 0) * .587 + (pixels[index + 2] ?? 0) * .114)
  return values
}
