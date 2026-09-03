export interface OcrResult { text: string; confidence: number }

export async function recognizeComplaintImage(url: string): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['ara', 'eng'])
  try {
    const result = await worker.recognize(url)
    return { text: result.data.text.trim(), confidence: result.data.confidence }
  } finally {
    await worker.terminate()
  }
}

export function inferLocationFromArabicText(text: string): { neighborhood?: string; alley?: string } {
  const neighborhood = text.match(/(?:محلة|م\.?)\s*[:-]?\s*([0-9٠-٩]{1,4})/i)?.[1]
  const alley = text.match(/(?:زقاق|ز\.?)\s*[:-]?\s*([0-9٠-٩]{1,4})/i)?.[1]
  return { neighborhood, alley }
}
