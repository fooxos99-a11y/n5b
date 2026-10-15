import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { screenStyles } from '../ScreenLayout';
import { narrationGroups, narrationMarkLabels, narrationSavedOverall, narrationStudentLabels, type NarrationEntry, type NarrationEvent, type NarrationSavedPart } from '../../domain/narrationManagement';
import type { NarrationManagementApi } from '../../services/narrationManagementApi';
import { useLoadedResource } from '../../hooks/useLoadedResource';

function NarrationReferenceDialog({ api, event, part, onClose }: { api: NarrationManagementApi; event: NarrationEvent; part: NarrationSavedPart; onClose: () => void }) {
  const loader = useCallback((signal: AbortSignal) => api.loadPartReference(event, part.id, signal), [api, event, part.id]); const resource = useLoadedResource(loader);
  return <FormDialog visible title={`آيات وأخطاء المقطع — الجزء ${part.juzNumber}`} onClose={onClose}>
    <AppText>{part.rangeLabel}</AppText>{resource.loading && <AppText>جارٍ تحميل الآيات</AppText>}
    {!!resource.error && <><AppText accessibilityRole="alert">{resource.error}</AppText><ActionButton label="إعادة تحميل آيات السرد" secondary onPress={() => { void resource.reload(); }} /></>}
    {(resource.value?.wordMarks ?? part.wordMarks).map((mark, index) => <View key={index} style={{ gap: 8 }}>
      <AppText style={screenStyles.bold}>{narrationMarkLabels[mark.markType]}</AppText><AppText>{mark.selectedText}</AppText>
      <AppText>{mark.startLocation} — {mark.endLocation}</AppText>{!!mark.notes && <AppText>{mark.notes}</AppText>}
    </View>)}
    {(resource.value?.ayahs ?? []).map(ayah => <AppText key={`${ayah.surah}:${ayah.ayah}`}>{ayah.textUthmani} ({ayah.surah}:{ayah.ayah})</AppText>)}
  </FormDialog>;
}
export function NarrationStudentDialog({ api, event, student, onClose }: { api: NarrationManagementApi; event: NarrationEvent; student: NarrationEntry; onClose: () => void }) {
  const [part, setPart] = useState<NarrationSavedPart | null>(null); const groups = narrationGroups(student); const overall = narrationSavedOverall(student);
  const names = [...new Set([...student.reciterNames, ...groups.flatMap(group => group.evaluatorNames)])];
  return <><FormDialog visible={!part} title={`نتائج سرد ${student.name}`} onClose={onClose}>
    <AppText>{student.committeeName || 'بدون حلقة'} — {narrationStudentLabels[student.status]}{student.archivedAt ? ' — مؤرشف' : ''}</AppText>
    <AppText>المقدار: {student.totalFaces} وجه، {groups.length} جزء</AppText>
    <AppText>{student.status === 'completed' ? 'النتيجة النهائية' : 'نتيجة الأجزاء المقيمة'}: {overall === null ? 'لم تُسجل نتيجة' : overall}</AppText>
    {!!student.finalRating && <AppText>التقدير المحفوظ: {student.finalRating}</AppText>}
    {!!names.length && <AppText>المسمعون والمقيمون: {names.join('، ')}</AppText>}
    {groups.map(group => <View key={group.juzNumber} style={{ gap: 10, paddingVertical: 10 }}><AppText style={screenStyles.bold}>الجزء {group.juzNumber}: {group.evaluated ? group.score : 'لم يُقيّم'}</AppText>
      <AppText>الأخطاء واللحون: {group.mistakeCount}، التنبيهات: {group.warningCount}، الترددات: {group.hesitationCount}</AppText>
      {group.parts.map((saved, index) => <View key={saved.id} style={{ gap: 8 }}><AppText>{saved.rangeLabel}، {saved.faces} وجه</AppText>
        {!!saved.evaluatorName && <AppText>المقيم: {saved.evaluatorName}{saved.evaluatedAt ? ` — ${saved.evaluatedAt}` : ''}</AppText>}
        {saved.wordMarks.map((mark, markIndex) => <View key={markIndex} style={{ gap: 4 }}><AppText>{narrationMarkLabels[mark.markType]}: {mark.selectedText || `${mark.startLocation} — ${mark.endLocation}`}</AppText>
          {!!mark.notes && <AppText>{mark.notes}</AppText>}</View>)}
        <ActionButton label={`عرض آيات وأخطاء الجزء ${group.juzNumber} المقطع ${index + 1}`} secondary onPress={() => setPart(saved)} />
      </View>)}
    </View>)}{!groups.length && <AppText>لا توجد مقاطع محفوظة.</AppText>}
  </FormDialog>{!!part && <NarrationReferenceDialog key={part.id} api={api} event={event} part={part} onClose={() => setPart(null)} />}</>;
}
