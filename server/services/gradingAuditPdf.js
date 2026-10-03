/** Evaluation counters and immutable compensation history shared by PDF exports. */
export function drawGradingAuditPdf(doc, { grades = {}, addPage, regularFont, boldFont, margin, contentWidth, pageHeight }) {
  const colors = { panel: '#ffffff', border: '#b6e3ef' };
  const number = value => Number(value || 0).toLocaleString('ar-SA');
  const layout = (value, width, size = 9, bold = false) => {
    doc.font(bold ? boldFont : regularFont).fontSize(size);
    const gap = Math.max(3, size * 0.35), lines = [[]];
    let used = 0;
    for (const word of String(value ?? '').trim().split(/\s+/)) {
      const wordWidth = doc.widthOfString(word);
      if (used && used + gap + wordWidth > width) { lines.push([]); used = 0; }
      lines.at(-1).push({ word, width: wordWidth });
      used += (used ? gap : 0) + wordWidth;
    }
    return { lines, gap, lineHeight: doc.currentLineHeight() + 2 };
  };
  const write = (value, x, y, width, options = {}) => {
    const { lines, gap, lineHeight } = layout(value, width, options.size || 9, options.bold);
    doc.fillColor(options.color || '#0f172a');
    lines.forEach((line, index) => {
      let cursor = x + width;
      for (const item of line) {
        doc.text(item.word, cursor - item.width, y + index * lineHeight, { width: item.width + 1, lineBreak: false });
        cursor -= item.width + gap;
      }
    });
  };
  const trackEvaluations = grades.trackSession?.studentsList || [];
  if (trackEvaluations.length) {
    addPage('تقييم المقاطع');
    let y = 100;
    for (const student of trackEvaluations) {
      if (y + 72 > pageHeight - 50) { addPage('تقييم المقاطع'); y = 100; }
      doc.roundedRect(margin, y, contentWidth, 64, 10).fill(colors.panel).stroke(colors.border);
      write(`${student.name} · ${student.committeeName || 'بدون حلقة'}`, margin + 12, y + 10, contentWidth - 24, { bold: true, size: 11 });
      write(`الأخطاء: ${number(student.segments?.mistakes)}   التنبيهات: ${number(student.segments?.warnings)}   الترددات: ${number(student.segments?.hesitations)}   المقاطع المعوضة: ${number(student.segments?.compensated)}`, margin + 12, y + 35, contentWidth - 24, { size: 10 });
      y += 74;
    }
  }
  const compensations = grades.compensations || [];
  if (compensations.length) {
    addPage('سجل التعويض');
    let y = 100;
    for (const row of compensations) {
      const reference = `مرجع الاستئذان: ${row.excuseReference || '-'}`;
      const cancellation = row.cancelledAt ? `ألغاه ${row.cancelledByName} في ${row.cancelledAt}: ${row.cancellationReason}` : '';
      const referenceLayout = layout(reference, contentWidth - 24);
      const referenceHeight = referenceLayout.lines.length * referenceLayout.lineHeight;
      const cancellationLayout = cancellation ? layout(cancellation, contentWidth - 24) : null;
      const cancellationHeight = cancellationLayout ? cancellationLayout.lines.length * cancellationLayout.lineHeight : 0;
      const height = 68 + referenceHeight + cancellationHeight;
      if (y + height > pageHeight - 50) { addPage('سجل التعويض'); y = 100; }
      doc.roundedRect(margin, y, contentWidth, height, 10).fill(colors.panel).stroke(colors.border);
      write(`${row.studentName} · ${row.scope === 'track' ? 'جلسة المسار' : 'البرنامج الأسبوعي'} · ${row.cancelledAt ? 'تعويض ملغى' : 'تعويض'}`, margin + 12, y + 10, contentWidth - 24, { bold: true, size: 11 });
      write(`اليوم المعوض: ${row.date}   نفذه: ${row.actorName}   وقت التسجيل: ${row.recordedAt}`, margin + 12, y + 33, contentWidth - 24, { size: 9 });
      write(reference, margin + 12, y + 55, contentWidth - 24, { size: 9, height: referenceHeight + 3 });
      if (cancellation) write(cancellation, margin + 12, y + 58 + referenceHeight, contentWidth - 24, { size: 9, height: cancellationHeight + 3 });
      y += height + 10;
    }
  }

}
