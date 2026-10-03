import { drawGradingAuditPdf } from './gradingAuditPdf.js';
import PDFDocument from 'pdfkit';

const colors = {
  primary: '#00ad9f',
  background: '#eff9fc',
  panel: '#ffffff',
  soft: '#f8fdff',
  border: '#b6e3ef',
  text: '#0f172a',
  muted: '#64748b',
};

const metricConfig = [
  ['attendance', 'الحضور', '#22c55e'],
  ['review', 'المراجعة', '#f59e0b'],
  ['link', 'الربط', '#06b6d4'],
  ['memorization', 'الحفظ', '#14b8a6'],
];

const leaderConfig = [
  ['review', 'الطلاب الأكثر مراجعة', '#f59e0b', 'faces', 'وجه'],
  ['link', 'الطلاب الأكثر ربطًا', '#06b6d4', 'faces', 'وجه'],
  ['memorization', 'الأكثر حفظًا في مسار الحفظ', '#14b8a6', 'faces', 'وجه'],
  ['committees', 'الحلقات الأعلى إنجازًا', '#22c55e', 'completionRate', '%'],
];

const number = (value) => Number(value || 0).toLocaleString('ar-SA');
const preserveArabicSpacing = (value) => String(value ?? '').replace(/ (?=[\u0600-\u06ff])/g, '\u00a0');

const arcPath = (cx, cy, radius, percentage) => {
  const value = Math.max(0, Math.min(99.99, Number(percentage || 0)));
  if (!value) return null;
  const start = -90;
  const end = start + (value * 3.6);
  const point = (angle) => {
    const radians = (angle * Math.PI) / 180;
    return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
  };
  const [sx, sy] = point(start);
  const [ex, ey] = point(end);
  return `M ${sx} ${sy} A ${radius} ${radius} 0 ${value > 50 ? 1 : 0} 1 ${ex} ${ey}`;
};

export async function buildOverviewPdf(report, { fontPair = null } = {}) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true });
    let regularFont = 'Helvetica';
    let boldFont = 'Helvetica-Bold';
    try {
      if (fontPair) {
        doc.registerFont('Arabic', fontPair.regular);
        doc.registerFont('ArabicBold', fontPair.bold);
        regularFont = 'Arabic';
        boldFont = 'ArabicBold';
      }
    } catch (error) {
      console.warn('Arabic PDF font registration failed; using the built-in fallback:', error.message);
    }
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 24;
    const contentWidth = pageWidth - margin * 2;
    const write = (value, x, y, width, options = {}) => {
      doc.font(options.bold ? boldFont : regularFont)
        .fontSize(options.size || 9)
        .fillColor(options.color || colors.text)
        .text(preserveArabicSpacing(value), x, y, {
          width,
          align: options.align || 'right',
          lineBreak: options.lineBreak !== false,
          ellipsis: true,
          height: options.height,
        });
    };
    let pageStarted = false;
    const addPage = (sectionTitle = '') => {
      if (pageStarted) doc.addPage();
      pageStarted = true;
      doc.rect(0, 0, pageWidth, pageHeight).fill(colors.background);
      doc.roundedRect(margin, 18, contentWidth, 50, 12).fill(colors.panel).stroke(colors.border);
      write('الإحصائيات', pageWidth - margin - 220, 30, 190, { size: 17, bold: true, color: colors.primary });
      write(`${report.period?.from || '-'} - ${report.period?.to || '-'}`, margin + 24, 35, 260, { size: 9, bold: true, color: colors.muted, align: 'left', lineBreak: false });
      if (sectionTitle) write(sectionTitle, margin, 76, contentWidth, { size: 13, bold: true, color: colors.text });
    };

    addPage();
    const totals = report.totals || {};
    const quran = totals.quranFaces || {};
    const grades = report.grades || {};
    const summaries = [
      ['الطلاب', totals.studentsCount, '#38bdf8'],
      ['عدد الحلقات', totals.familiesCount, '#84cc16'],
      ['إجمالي أوجه الحفظ', quran.memorization, '#14b8a6'],
      ['إجمالي أوجه المراجعة', quran.review, '#f59e0b'],
      ['إجمالي أوجه الربط', quran.link, '#06b6d4'],
      ['البرنامج الأسبوعي %', grades.weeklyProgram?.percentage, '#22c55e'],
      ['الجلسة الأسبوعية %', grades.weeklySession?.percentage, '#f97316'],
      ['جلسة المسار %', grades.trackSession?.percentage, '#0ea5e9'],
      ['درجات يوم السرد', grades.narration?.grade, '#e11d48'],
      ['الأوجه المقروءة', grades.facesRead?.total, '#046e65'],
    ];
    const summaryGap = 8;
    const summaryWidth = (contentWidth - summaryGap * 5) / 6;
    summaries.forEach(([label, value, color], index) => {
      const x = margin + (index % 6) * (summaryWidth + summaryGap);
      const y = 82 + Math.floor(index / 6) * 74;
      doc.roundedRect(x, y, summaryWidth, 68, 10).fill(colors.panel).stroke(colors.border);
      doc.circle(x + 18, y + 19, 7).fill(color);
      write(label, x + 8, y + 12, summaryWidth - 16, { size: 8.5, bold: true });
      write(number(value), x + 8, y + 37, summaryWidth - 16, { size: 18, bold: true, color });
    });

    const cardGap = 10;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    const cardHeight = 176;
    leaderConfig.forEach(([key, title, color, valueKey, suffix], index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = margin + column * (cardWidth + cardGap);
      const y = 236 + row * (cardHeight + cardGap);
      doc.roundedRect(x, y, cardWidth, cardHeight, 11).fill(colors.panel).stroke(colors.border);
      doc.circle(x + cardWidth - 20, y + 19, 8).fill(color);
      write(title, x + 12, y + 12, cardWidth - 42, { size: 10, bold: true });
      const rows = (report.quranLeaders?.[key] || []).slice(0, 5);
      if (!rows.length) {
        write('لا توجد بيانات في هذه الفترة.', x + 12, y + 76, cardWidth - 24, { size: 8, bold: true, color: colors.muted, align: 'center' });
      }
      rows.forEach((item, rowIndex) => {
        const rowY = y + 43 + rowIndex * 25;
        if (rowIndex) doc.moveTo(x + 12, rowY - 5).lineTo(x + cardWidth - 12, rowY - 5).strokeColor('#e0f2f8').lineWidth(0.6).stroke();
        doc.circle(x + cardWidth - 19, rowY + 6, 8).fill('#e0f2f8');
        write(number(rowIndex + 1), x + cardWidth - 25, rowY + 2, 12, { size: 7, bold: true, color: colors.primary, align: 'center', lineBreak: false });
        write(item.name || '-', x + 62, rowY, cardWidth - 92, { size: 8.5, bold: true, lineBreak: false });
        write(`${number(item[valueKey])}${suffix === '%' ? '%' : ' ' + suffix}`, x + 10, rowY, 54, { size: 8, bold: true, color, align: 'left', lineBreak: false });
      });
    });

    const committees = report.committeeIndicators || [];
    if (committees.length) {
      addPage('مؤشرات الحلقات');
      let y = 100;
      const committeeWidth = (contentWidth - 12) / 2;
      committees.forEach((committee, index) => {
        if (index > 0 && index % 4 === 0) {
          addPage('مؤشرات الحلقات');
          y = 100;
        }
        const column = index % 2;
        const row = Math.floor((index % 4) / 2);
        const x = margin + column * (committeeWidth + 12);
        const cardY = y + row * 210;
        doc.roundedRect(x, cardY, committeeWidth, 194, 12).fill(colors.panel).stroke(colors.border);
        write(committee.name, x + 14, cardY + 12, committeeWidth - 90, { size: 12, bold: true });
        write(`${number(committee.studentsCount)} طالب`, x + 14, cardY + 32, committeeWidth - 28, { size: 8, bold: true, color: colors.muted });
        write(`${number(committee.overallPercentage)}%`, x + committeeWidth - 70, cardY + 15, 52, { size: 11, bold: true, color: colors.primary, align: 'center' });
        const gaugeWidth = (committeeWidth - 24) / 5;
        metricConfig.forEach(([metricKey, label, color], metricIndex) => {
          const metric = committee.metrics?.[metricKey] || {};
          const cx = x + 12 + gaugeWidth * metricIndex + gaugeWidth / 2;
          const cy = cardY + 92;
          doc.circle(cx, cy, 25).lineWidth(6).strokeColor('#cbd5e1').stroke();
          const path = arcPath(cx, cy, 25, metric.percentage);
          if (path) doc.path(path).lineWidth(6).lineCap('round').strokeColor(color).stroke();
          write(`${number(metric.percentage)}%`, cx - 22, cy - 5, 44, { size: 8, bold: true, align: 'center', lineBreak: false });
          write(label, cx - gaugeWidth / 2 + 2, cardY + 127, gaugeWidth - 4, { size: 7.5, bold: true, align: 'center', lineBreak: false });
          write(`${Number(metric.done || 0)} / ${Number(metric.total || 0)}`, cx - gaugeWidth / 2 + 2, cardY + 147, gaugeWidth - 4, { size: 7, bold: true, color: colors.muted, align: 'center', lineBreak: false });
        });
      });
    }

    drawGradingAuditPdf(doc, { grades, addPage, regularFont, boldFont, margin, contentWidth, pageHeight });

    const range = doc.bufferedPageRange();
    for (let pageIndex = 0; pageIndex < range.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      const center = pageWidth / 2;
      write(String(pageIndex + 1), center - 24, pageHeight - 40, 16, { size: 7.5, bold: true, color: colors.muted, align: 'center', lineBreak: false });
      write('/', center - 8, pageHeight - 40, 16, { size: 7.5, bold: true, color: colors.muted, align: 'center', lineBreak: false });
      write(String(range.count), center + 8, pageHeight - 40, 16, { size: 7.5, bold: true, color: colors.muted, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
