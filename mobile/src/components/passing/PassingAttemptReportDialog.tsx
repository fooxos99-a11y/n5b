import { View } from 'react-native';
import { PASSING_FIELDS } from '../../../../shared/passing-policy.js';
import { RECITATION_MARK_LABELS } from '../../../../shared/recitation-mark-types.js';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import { passingRangeLabel, type PassingPolicy, type PassingReportPart, type PassingResult } from '../../domain/passingManagement';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { SectionCard, screenStyles } from '../ScreenLayout';
import { usePalette } from '../../theme';

export function PassingResultSummary({ result }: { result: PassingResult }) {
  return <View style={{ gap: 6 }}><AppText style={screenStyles.bold}>{result.passed ? 'اجتاز' : 'يحتاج إعادة'}</AppText>
    <AppText>الدرجة {result.score}/{result.maxScore}</AppText>
    <AppText>أخطاء/لحون: {result.mistakeCount} · تنبيهات: {result.warningCount} · ترددات: {result.hesitationCount}</AppText>
    {result.reasons.map((reason, index) => <AppText key={index}>{reason}</AppText>)}</View>;
}
export function PassingAttemptReportDialog({ part, onClose }: { part: PassingReportPart | null; onClose: () => void }) {
  const palette = usePalette();
  return <FormDialog visible={!!part} title={`تقرير الجزء ${part?.juzNumber ?? ''}`} onClose={onClose}>
    {!!part && !part.attempts.length && <AppText>لم يبدأ تسميع هذا الجزء.</AppText>}
    {part?.attempts.map((attempt, index) => <SectionCard key={attempt.id} title={`المحاولة ${part.attempts.length - index}`}>
      <AppText>{formatHijriDate(attempt.createdAt.slice(0, 10))} · {attempt.actorName}</AppText>
      <PassingResultSummary result={attempt.result} />
      <AppText>{attempt.rehifzDecision === 'repeat' ? `إعادة حفظ الجزء كاملًا · ${attempt.rehifzStatus === 'completed' ? 'اكتملت' : 'ضمن الخطة'}`
        : attempt.rehifzDecision === 'pending' ? 'قرار إعادة الحفظ لم يُحدد بعد' : 'إبقاء الخطة'}</AppText>
      <AppText style={screenStyles.bold}>نطاق المحاولة</AppText>
      {attempt.ranges.map((range, rangeIndex) => <AppText key={rangeIndex}>{passingRangeLabel(range)}</AppText>)}
      {attempt.mode === 'count' && <AppText style={{ color: palette.muted }}>سُجلت الأعداد فقط؛ مواضع الأخطاء غير محددة.</AppText>}
      {attempt.marks.map((mark, position) => <View key={position} style={[screenStyles.row, { borderColor: palette.border }]}>
        <AppText style={screenStyles.bold}>{RECITATION_MARK_LABELS[mark.markType]} · سورة وآية {mark.startLocation.split(':').slice(0, 2).join(':')}
          {mark.endLocation !== mark.startLocation ? ` إلى ${mark.endLocation.split(':').slice(0, 2).join(':')}` : ''}</AppText>
        <AppText>{mark.selectedText}</AppText>{!!mark.notes && <AppText style={{ color: palette.muted }}>{mark.notes}</AppText>}
      </View>)}
      <AppText style={screenStyles.bold}>الإعدادات المستخدمة</AppText>
      {PASSING_FIELDS.map(field => <AppText key={field.key}>{field.label}: {attempt.policy[field.key as keyof PassingPolicy]}</AppText>)}
    </SectionCard>)}
  </FormDialog>;
}
