import { Buffer } from 'node:buffer';
import PDFDocument from 'pdfkit';

export const REPORT_PDF_COLORS = Object.freeze({
  primary: '#00ad9f', background: '#eff9fc', panel: '#ffffff',
  softPanel: '#f8fdff', border: '#b6e3ef', text: '#0f172a', muted: '#64748b',
});

export function registerReportFonts(doc, fontPair) {
  if (fontPair) {
    try {
      doc.registerFont('Arabic', fontPair.regular);
      doc.registerFont('ArabicBold', fontPair.bold);
      return { regularFont: 'Arabic', boldFont: 'ArabicBold' };
    } catch {
      return { regularFont: 'Helvetica', boldFont: 'Helvetica-Bold' };
    }
  }
  return { regularFont: 'Helvetica', boldFont: 'Helvetica-Bold' };
}

export function createBufferedPdf(options, fontPair, resolve, reject) {
  const doc = new PDFDocument(options);
  const fonts = registerReportFonts(doc, fontPair);
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);
  return { doc, ...fonts };
}
