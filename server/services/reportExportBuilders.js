import ExcelJS from 'exceljs';
import { siteName } from '../siteConfig.js';
import PDFDocument from 'pdfkit';

const metricKeys = [
  ['attendance', 'الحضور'],
  ['review', 'المراجعة'],
  ['link', 'الربط'],
  ['memorization', 'الحفظ'],
];

const statusLabels = {
  present: 'حاضر',
  late: 'متأخر',
  excused: 'مستأذن',
  absent: 'غائب',
  no_session: 'لا توجد جلسة',
};

const theme = {
  primary: 'FF05677F',
  accent: 'FF008AAD',
  accentSoft: 'FFE6F7FB',
  background: 'FFF5FBFD',
  panel: 'FFFFFFFF',
  text: 'FF0F172A',
  muted: 'FF64748B',
  border: 'FFD2EAF1',
  success: 'FF16A34A',
  successSoft: 'FFDCFCE7',
  warning: 'FFD97706',
  warningSoft: 'FFFEF3C7',
  danger: 'FFDC2626',
  dangerSoft: 'FFFEE2E2',
  infoSoft: 'FFE0F2FE',
};

const percentageFill = (value) => {
  const percentage = Number(value || 0);
  if (percentage >= 0.85) return theme.successSoft;
  if (percentage >= 0.6) return theme.warningSoft;
  return theme.dangerSoft;
};

export const styleModernReportSheet = (sheet, {
  title,
  subtitle,
  widths = [],
  summary = [],
  percentageColumns = [],
  statusColumn = null,
  rightAlignedColumns = [],
} = {}) => {
  const columnCount = Math.max(widths.length, sheet.columnCount, 1);
  const introRows = summary.length ? 6 : 3;
  const insertedRows = [
    [title || sheet.name],
    [subtitle || ''],
    [],
  ];
  if (summary.length) {
    insertedRows.push(summary.map(([label]) => label), summary.map(([, value]) => value), []);
  }
  sheet.spliceRows(1, 0, ...insertedRows);
  const headerRowNumber = introRows + 1;
  const firstDataRow = headerRowNumber + 1;
  sheet.mergeCells(1, 1, 1, columnCount);
  sheet.mergeCells(2, 1, 2, columnCount);
  sheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];
  sheet.properties.defaultRowHeight = 22;
  sheet.properties.tabColor = { argb: theme.accent };
  sheet.pageSetup = {
    orientation: columnCount > 7 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.3, right: 0.3, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 },
    printTitlesRow: `1:${headerRowNumber}`,
  };
  sheet.headerFooter = { oddFooter: '&Cصفحة &P من &N' };
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  const titleRow = sheet.getRow(1);
  titleRow.height = 38;
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.primary } };
  titleRow.getCell(1).font = { name: 'Arial', bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
  const subtitleRow = sheet.getRow(2);
  subtitleRow.height = 28;
  subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.accentSoft } };
  subtitleRow.getCell(1).font = { name: 'Arial', bold: true, size: 11, color: { argb: theme.primary } };
  subtitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
  sheet.getRow(3).height = 9;

  if (summary.length) {
    const labelRow = sheet.getRow(4);
    const valueRow = sheet.getRow(5);
    labelRow.height = 24;
    valueRow.height = 34;
    summary.forEach(([, value], index) => {
      const labelCell = labelRow.getCell(index + 1);
      const valueCell = valueRow.getCell(index + 1);
      [labelCell, valueCell].forEach((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? theme.infoSoft : theme.accentSoft } };
        cell.border = {
          top: { style: 'thin', color: { argb: theme.border } },
          bottom: { style: 'thin', color: { argb: theme.border } },
          left: { style: 'thin', color: { argb: theme.border } },
          right: { style: 'thin', color: { argb: theme.border } },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
      });
      labelCell.font = { name: 'Arial', bold: true, size: 10, color: { argb: theme.muted } };
      valueCell.font = { name: 'Arial', bold: true, size: 17, color: { argb: theme.primary } };
      valueCell.value = value;
    });
    sheet.getRow(6).height = 9;
  }

  const header = sheet.getRow(headerRowNumber);
  header.height = 30;
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.accent } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' };
  });
  for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 24;
    row.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: theme.text } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowNumber % 2 ? theme.panel : theme.background } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, readingOrder: 'rtl' };
      cell.border = {
        bottom: { style: 'hair', color: { argb: theme.border } },
      };
    });
    rightAlignedColumns.forEach((column) => {
      row.getCell(column).alignment = { vertical: 'middle', horizontal: 'right', wrapText: true, readingOrder: 'rtl' };
      row.getCell(column).font = { name: 'Arial', bold: true, size: 10, color: { argb: theme.text } };
    });
    percentageColumns.forEach((column) => {
      const cell = row.getCell(column);
      cell.numFmt = '0%';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: percentageFill(cell.value) } };
      cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: theme.text } };
    });
    if (statusColumn) {
      const cell = row.getCell(statusColumn);
      const value = String(cell.value || '');
      const isSuccess = value === 'حاضر' || value === 'متقن';
      const isWarning = !value || value === 'متأخر' || value === 'مستأذن' || value === 'لم يقيّم' || value === 'لا توجد جلسة';
      const _resolveArgb = () => {
        if (isSuccess) {
          return theme.successSoft;
        }
        if (isWarning) {
          return theme.warningSoft;
        }
        return theme.dangerSoft;
      };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _resolveArgb() } };
      const _resolveArgb2 = () => {
        if (isSuccess) {
          return theme.success;
        }
        if (isWarning) {
          return theme.warning;
        }
        return theme.danger;
      };
      cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: _resolveArgb2() } };
    }
  }
  sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: columnCount } };
  sheet.printArea = `A1:${sheet.getColumn(columnCount).letter}${Math.max(sheet.rowCount, headerRowNumber)}`;
  return { headerRowNumber, firstDataRow };
};

const addOverviewSheets = (workbook, report, { reportTitle = 'تقرير الإحصائيات' } = {}) => {
  const totals = report?.totals || {};
  const quranFaces = totals.quranFaces || {};
  const grades = report?.grades || {};
  const summary = workbook.addWorksheet('الملخص');
  const summaryCards = [
    ['الطلاب', Number(totals.studentsCount || 0)],
    ['الحلق', Number(totals.familiesCount || 0)],
    ['المعلمون والمقرئون', Number(totals.supervisorsCount || 0)],
    ['أوجه الحفظ', Number(quranFaces.memorization || 0)],
    ['أوجه المراجعة', Number(quranFaces.review || 0)],
    ['أوجه الربط', Number(quranFaces.link || 0)],
    ['البرنامج الأسبوعي %', Number(grades.weeklyProgram?.percentage || 0)],
    ['الجلسة الأسبوعية %', Number(grades.weeklySession?.percentage || 0)],
    ['جلسة المسار %', Number(grades.trackSession?.percentage || 0)],
    ['درجات يوم السرد', Number(grades.narration?.grade || 0)],
    ['الأوجه المقروءة', Number(grades.facesRead?.total || 0)],
  ];
  summary.addRow(summaryCards.map(([label]) => label));
  summary.addRow(summaryCards.map(([, value]) => value));
  summary.columns = summaryCards.map(() => ({ width: 18 }));
  styleModernReportSheet(summary, {
    title: reportTitle,
    subtitle: `الفترة من ${report?.period?.from || '-'} إلى ${report?.period?.to || '-'}`,
    widths: summaryCards.map(() => 18),
    rightAlignedColumns: [],
  });
  summary.autoFilter = null;
  summary.getRow(4).height = 26;
  summary.getRow(5).height = 38;
  summary.getRow(4).eachCell((cell, index) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? theme.infoSoft : theme.accentSoft } };
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: theme.muted } };
  });
  summary.getRow(5).eachCell((cell, index) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? theme.infoSoft : theme.accentSoft } };
    cell.font = { name: 'Arial', bold: true, size: 18, color: { argb: theme.primary } };
    cell.numFmt = '#,##0';
  });
  summary.views = [{ rightToLeft: true, showGridLines: false }];

  const committees = workbook.addWorksheet('مؤشرات الحلق');
  committees.addRow([
    'الحلقة', 'الطلاب', 'النسبة الإجمالية',
    ...metricKeys.flatMap(([, label]) => [`${label} المنجز`, `${label} الإجمالي`, `${label} %`]),
  ]);
  (report?.committeeIndicators || []).forEach((committee) => {
    committees.addRow([
      committee.name,
      Number(committee.studentsCount || 0),
      Number(committee.overallPercentage || 0) / 100,
      ...metricKeys.flatMap(([key]) => [
        Number(committee.metrics?.[key]?.done || 0),
        Number(committee.metrics?.[key]?.total || 0),
        Number(committee.metrics?.[key]?.percentage || 0) / 100,
      ]),
    ]);
  });
  styleModernReportSheet(committees, {
    title: 'مؤشرات الحلق',
    subtitle: `${reportTitle} | ${report?.period?.from || '-'} إلى ${report?.period?.to || '-'}`,
    widths: [24, 12, 16, ...new Array(metricKeys.length * 3).fill(14)],
    percentageColumns: [3, 6, 9, 12, 15, 18],
    rightAlignedColumns: [1],
  });

  const students = workbook.addWorksheet('مؤشرات الطلاب');
  students.addRow([
    'الحلقة', 'الطالب', 'النسبة الإجمالية',
    ...metricKeys.flatMap(([, label]) => [`${label} المنجز`, `${label} الإجمالي`, `${label} %`]),
  ]);
  (report?.committeeIndicators || []).forEach((committee) => {
    (committee.students || []).forEach((student) => {
      students.addRow([
        committee.name,
        student.name,
        Number(student.overallPercentage || 0) / 100,
        ...metricKeys.flatMap(([key]) => [
          Number(student.metrics?.[key]?.done || 0),
          Number(student.metrics?.[key]?.total || 0),
          Number(student.metrics?.[key]?.percentage || 0) / 100,
        ]),
      ]);
    });
  });
  styleModernReportSheet(students, {
    title: 'مؤشرات الطلاب',
    subtitle: `${reportTitle} | ${report?.period?.from || '-'} إلى ${report?.period?.to || '-'}`,
    widths: [24, 26, 16, ...new Array(metricKeys.length * 3).fill(14)],
    percentageColumns: [3, 6, 9, 12, 15, 18],
    rightAlignedColumns: [1, 2],
  });

  const leaders = workbook.addWorksheet('الأعلى إنجازاً');
  leaders.addRow(['المؤشر', 'الترتيب', 'الاسم', 'الحلقة', 'القيمة']);
  const leaderGroups = [
    ['المراجعة', 'review', 'faces'],
    ['الربط', 'link', 'faces'],
    ['الحفظ', 'memorization', 'faces'],
    ['الحلق الأعلى إنجازاً', 'committees', 'completionRate'],
  ];
  leaderGroups.forEach(([label, key, valueKey]) => {
    (report?.quranLeaders?.[key] || []).forEach((row, index) => {
      leaders.addRow([label, index + 1, row.name, row.committeeName || '-', Number(row[valueKey] || 0)]);
    });
  });
  styleModernReportSheet(leaders, {
    title: 'الأعلى إنجازاً',
    subtitle: `${reportTitle} | ${report?.period?.from || '-'} إلى ${report?.period?.to || '-'}`,
    widths: [24, 10, 26, 24, 14],
    rightAlignedColumns: [1, 3, 4],
  });
};

export async function buildOverviewExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteName;
  addOverviewSheets(workbook, report);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildSupervisorExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteName;
  const sheet = workbook.addWorksheet('تحضير الكادر');
  sheet.addRow(['الاسم', 'رقم الدخول', 'المسمى', 'الحالة', 'وقت الحضور', 'التاريخ']);
  (report?.rows || []).forEach((row) => {
    sheet.addRow([
      row.name,
      row.loginNumber || '-',
      row.jobTitle || '-',
      statusLabels[row.status] || 'لم يُرصد',
      row.checkInTime || '-',
      row.recordDate || report?.period?.from,
    ]);
  });
  const rows = report?.rows || [];
  styleModernReportSheet(sheet, {
    title: 'تقرير الكادر',
    subtitle: `من ${report?.period?.from || '-'} إلى ${report?.period?.to || '-'}`,
    widths: [28, 16, 24, 22, 16, 16],
    summary: [
      ['الكادر', new Set(rows.map((row) => row.id)).size],
      ['الحاضرون', rows.filter((row) => row.status === 'present').length],
      ['المتأخرون', rows.filter((row) => row.status === 'late').length],
      ['المعتذرون', rows.filter((row) => row.status === 'excused').length],
      ['الغائبون', rows.filter((row) => row.status === 'absent').length],
    ],
    statusColumn: 4,
    rightAlignedColumns: [1, 3],
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const addArchiveProgressSheet = (workbook, archive) => {
  const sheet = workbook.addWorksheet('تقرير الطلاب');
  sheet.addRow(['الطالب', 'الحلقة', 'الحضور', 'التأخير', 'الاستئذان', 'الحفظ %', 'التكرار %', 'المراجعة %', 'الربط %', 'النسبة الإجمالية']);
  (archive?.progressReport?.rows || []).forEach((row) => {
    sheet.addRow([
      row.name,
      row.committeeName || 'بدون حلقة',
      Number(row.attendance?.attended || 0),
      Number(row.attendance?.late || 0),
      Number(row.attendance?.excused || 0),
      Number(row.tasks?.memorization?.percentage || 0) / 100,
      Number(row.tasks?.repeat?.percentage || 0) / 100,
      Number(row.tasks?.review?.percentage || 0) / 100,
      Number(row.tasks?.link?.percentage || 0) / 100,
      Number(row.overallPercentage || 0) / 100,
    ]);
  });
  const rows = archive?.progressReport?.rows || [];
  const average = rows.length
    ? rows.reduce((sum, row) => sum + Number(row.overallPercentage || 0), 0) / rows.length / 100
    : 0;
  styleModernReportSheet(sheet, {
    title: 'تقرير الطلاب المؤرشف',
    subtitle: `${archive?.title || 'أرشيف التقارير'} | ${archive?.period?.from || '-'} إلى ${archive?.period?.to || '-'}`,
    widths: [26, 22, 12, 12, 12, 12, 12, 12, 12, 16],
    summary: [
      ['الطلاب', rows.length],
      ['متوسط الإنجاز', average],
      ['أوجه الحفظ', Number(archive?.overviewReport?.totals?.quranFaces?.memorization || 0)],
      ['أوجه المراجعة', Number(archive?.overviewReport?.totals?.quranFaces?.review || 0)],
    ],
    percentageColumns: [6, 7, 8, 9, 10],
    rightAlignedColumns: [1, 2],
  });
  sheet.getRow(5).getCell(2).numFmt = '0%';
};

export async function buildArchiveExcel(archive) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteName;
  addOverviewSheets(workbook, archive?.overviewReport || { period: archive?.period }, { reportTitle: archive?.title || 'أرشيف التقارير' });
  addArchiveProgressSheet(workbook, archive);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const writeArabicText = (doc, value, x, y, options = {}) => {
  const { width = 100, align = 'right', font = 'Arabic', size = 10, color = '#0f172a' } = options;
  const text = String(value ?? '-');
  doc.fillColor(color).font(font).fontSize(size);
  if (!/[\u0600-\u06FF]/.test(text)) {
    doc.text(text, x, y, { width, align, lineBreak: false, ellipsis: true });
    return;
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  const gap = Math.max(3, size * 0.35);
  const widths = words.map((word) => doc.widthOfString(word));
  const phraseWidth = widths.reduce((sum, item) => sum + item, 0) + Math.max(words.length - 1, 0) * gap;
  let cursor = align === 'center' ? x + ((width + Math.min(phraseWidth, width)) / 2) : x + width;
  words.forEach((word, index) => {
    if (cursor - widths[index] < x) return;
    doc.text(word, cursor - widths[index], y, { width: widths[index] + 1, lineBreak: false });
    cursor -= widths[index] + gap;
  });
};

const buildTablePdf = ({ title, period, summary = [], columns, rows, siteName, fontPair }) => new Promise((resolve, reject) => {
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true });
  let regularFont = 'Helvetica';
  let boldFont = 'Helvetica-Bold';
  if (fontPair) {
    try {
      doc.registerFont('Arabic', fontPair.regular);
      doc.registerFont('ArabicBold', fontPair.bold);
      regularFont = 'Arabic';
      boldFont = 'ArabicBold';
    } catch {
      regularFont = 'Helvetica';
      boldFont = 'Helvetica-Bold';
    }
  }
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const margin = 28;
  const contentWidth = doc.page.width - margin * 2;
  const rowHeight = 25;
  const drawHeader = () => {
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f4fbfd');
    doc.roundedRect(margin, 20, contentWidth, 54, 12).fill('#ffffff').stroke('#b6e3ef');
    doc.fillColor('#475569').font(regularFont).fontSize(9.5);
    doc.text(String(period?.from || '-'), margin + 190, 40, { width: 108, align: 'center', lineBreak: false });
    doc.text('-', margin + 298, 40, { width: 20, align: 'center', lineBreak: false });
    doc.text(String(period?.to || '-'), margin + 318, 40, { width: 108, align: 'center', lineBreak: false });
    writeArabicText(doc, title, margin + contentWidth - 285, 36, { width: 265, font: boldFont, size: 16.5, color: '#057f75' });
    writeArabicText(doc, siteName || '', margin + 20, 39, { width: 150, align: 'left', font: boldFont, size: 10, color: '#00ad9f' });
    writeArabicText(doc, 'الفترة', margin + 434, 40, { width: 48, font: boldFont, size: 9, color: '#64748b' });
  };
  const drawTableHeader = (y) => {
    let x = margin;
    doc.roundedRect(margin, y, contentWidth, 24, 7).fill('#dff4fa').stroke('#b6e3ef');
    columns.forEach((column) => {
      writeArabicText(doc, column.label, x + 5, y + 7, { width: column.width - 10, align: 'center', font: boldFont, size: 8.5 });
      x += column.width;
    });
  };
  drawHeader();
  let y = 86;
  if (summary.length) {
    summary.forEach(([label, value], index) => {
      const cardWidth = Math.min(160, (contentWidth - 12) / summary.length);
      const x = margin + contentWidth - ((index + 1) * cardWidth) - (index * 4);
      doc.roundedRect(x, y, cardWidth - 4, 38, 8).fill('#ffffff').stroke('#cdeaf2');
      writeArabicText(doc, label, x + 8, y + 6, { width: cardWidth - 20, font: regularFont, size: 8, color: '#64748b' });
      writeArabicText(doc, value, x + 8, y + 20, { width: cardWidth - 20, font: boldFont, size: 11, color: '#0f172a' });
    });
    y += 50;
  }
  drawTableHeader(y);
  y += 28;
  rows.forEach((row, index) => {
    if (y + rowHeight > doc.page.height - 34) {
      doc.addPage();
      drawHeader();
      y = 88;
      drawTableHeader(y);
      y += 28;
    }
    let x = margin;
    doc.roundedRect(margin, y, contentWidth, rowHeight - 2, 6).fill(index % 2 ? '#ffffff' : '#f8fdff').stroke('#d9edf4');
    columns.forEach((column) => {
      writeArabicText(doc, column.value(row), x + 5, y + 8, {
        width: column.width - 10,
        align: column.align || 'center',
        font: column.bold ? boldFont : regularFont,
        size: 8.5,
      });
      x += column.width;
    });
    y += rowHeight;
  });
  if (!rows.length) {
    writeArabicText(doc, 'لا توجد بيانات.', margin, y + 28, { width: contentWidth, align: 'center', font: boldFont, size: 16, color: '#64748b' });
  }
  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const center = doc.page.width / 2;
    doc.fillColor('#64748b').font(regularFont).fontSize(8);
    doc.text(String(pageIndex + 1), center - 24, doc.page.height - 24, { width: 16, align: 'center', lineBreak: false });
    doc.text('/', center - 8, doc.page.height - 24, { width: 16, align: 'center', lineBreak: false });
    doc.text(String(pageRange.count), center + 8, doc.page.height - 24, { width: 16, align: 'center', lineBreak: false });
  }
  doc.end();
});

export function buildSupervisorPdf(report, options = {}) {
  const columns = [
    { label: 'التاريخ', width: 90, value: (row) => row.recordDate || report?.period?.from || '-' },
    { label: 'وقت الحضور', width: 100, value: (row) => row.checkInTime || '-' },
    { label: 'الحالة', width: 125, value: (row) => statusLabels[row.status] || 'لم يُرصد' },
    { label: 'المسمى', width: 160, value: (row) => row.jobTitle || '-' },
    { label: 'رقم الدخول', width: 105, value: (row) => row.loginNumber || '-' },
    { label: 'الاسم', width: 205, value: (row) => row.name || '-', align: 'right', bold: true },
  ];
  return buildTablePdf({
    title: 'تقرير الكادر',
    period: report?.period,
    summary: [['الكادر', new Set((report?.rows || []).map((row) => row.id)).size]],
    columns,
    rows: report?.rows || [],
    ...options,
  });
}

export function buildArchivePdf(archive, options = {}) {
  const rows = archive?.progressReport?.rows || [];
  const totals = archive?.overviewReport?.totals || {};
  const quranFaces = totals.quranFaces || {};
  const columns = [
    { label: 'النسبة', width: 70, value: (row) => `${Number(row.overallPercentage || 0)}%`, bold: true },
    { label: 'الربط', width: 70, value: (row) => `${Number(row.tasks?.link?.percentage || 0)}%` },
    { label: 'المراجعة', width: 80, value: (row) => `${Number(row.tasks?.review?.percentage || 0)}%` },
    { label: 'التكرار', width: 75, value: (row) => `${Number(row.tasks?.repeat?.percentage || 0)}%` },
    { label: 'الحفظ', width: 70, value: (row) => `${Number(row.tasks?.memorization?.percentage || 0)}%` },
    { label: 'الحضور', width: 70, value: (row) => Number(row.attendance?.attended || 0) },
    { label: 'الحلقة', width: 145, value: (row) => row.committeeName || 'بدون حلقة' },
    { label: 'الطالب', width: 205, value: (row) => row.name || '-', align: 'right', bold: true },
  ];
  return buildTablePdf({
    title: archive?.title || 'أرشيف التقارير',
    period: archive?.period,
    summary: [
      ['الطلاب', Number(totals.studentsCount || rows.length)],
      ['الحلق', Number(totals.familiesCount || 0)],
      ['أوجه الحفظ', Number(quranFaces.memorization || 0)],
      ['أوجه المراجعة', Number(quranFaces.review || 0)],
    ],
    columns,
    rows,
    ...options,
  });
}
