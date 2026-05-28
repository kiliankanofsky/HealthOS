// Server-seitige PDF-Text-Extraktion. Nutzt pdf-parse v2 (pure JS, Vercel-kompatibel).
// Wird in der Plan-Setup Server Action aufgerufen — der extrahierte Text landet
// in training_plans.reference_pdf_text und dient der KI in Sprint 3 als Kontext.
//
// pdf-parse v2 nutzt die `PDFParse`-Klasse (nicht mehr Default-Export wie in v1).
export async function extractPdfText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  // pdfjs erwartet Uint8Array, PDFParse konvertiert intern automatisch.
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
