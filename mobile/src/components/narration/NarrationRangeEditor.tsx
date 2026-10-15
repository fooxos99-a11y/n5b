import { useState } from 'react';
import { View } from 'react-native';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { ChoiceDialog } from '../ChoiceDialog';
import { FormDialog } from '../FormDialog';
import { FormField } from '../FormField';
import { screenStyles } from '../ScreenLayout';
import { emptyNarrationRange, narrationRangeLabel, normalizeNarrationRange, type NarrationRange, type NarrationRangeDraft, type NarrationReferences } from '../../domain/narrationManagement';

export function NarrationRangeEditor({ references, initial, onSave, onClose }: {
  references: NarrationReferences; initial: readonly NarrationRange[]; onSave: (ranges: NarrationRange[]) => void; onClose: () => void;
}) {
  const [ranges, setRanges] = useState<NarrationRange[]>([...initial]); const [draft, setDraft] = useState<NarrationRangeDraft>(emptyNarrationRange);
  const [choice, setChoice] = useState<'startSurah' | 'endSurah' | null>(null); const [error, setError] = useState('');
  function add() { try { const range = normalizeNarrationRange(draft, references); if (ranges.length >= 30) throw new Error('يمكن تحديد 30 مقطعًا لكل طالب.');
    setRanges(current => [...current, range]); setDraft(emptyNarrationRange()); setError('');
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'راجع نطاق المقطع.'); } }
  const dirty = !!draft.startAyah.trim() || !!draft.endAyah.trim();
  return <><FormDialog visible={!choice} title="نطاقات السرد" onClose={onClose}
    footer={<><ActionButton label="اعتماد النطاقات" disabled={!ranges.length || dirty} onPress={() => onSave(ranges)} /><ActionButton label="إلغاء" secondary onPress={onClose} /></>}>
    <View style={screenStyles.grid}>
      <View style={screenStyles.field}><AppText>سورة البداية</AppText><ActionButton label={references.chapters.find(chapter => chapter.number === Number(draft.startSurah))?.name ?? 'اختر السورة'} accessibilityLabel="سورة بداية مقطع السرد" secondary onPress={() => setChoice('startSurah')} />
        <FormField label="آية بداية مقطع السرد" keyboardType="number-pad" value={draft.startAyah} onChangeText={startAyah => setDraft(current => ({ ...current, startAyah }))} /></View>
      <View style={screenStyles.field}><AppText>سورة النهاية</AppText><ActionButton label={references.chapters.find(chapter => chapter.number === Number(draft.endSurah))?.name ?? 'اختر السورة'} accessibilityLabel="سورة نهاية مقطع السرد" secondary onPress={() => setChoice('endSurah')} />
        <FormField label="آية نهاية مقطع السرد" keyboardType="number-pad" value={draft.endAyah} onChangeText={endAyah => setDraft(current => ({ ...current, endAyah }))} /></View>
    </View>
    <View style={screenStyles.actions}><ActionButton label="إضافة مقطع السرد" disabled={ranges.length >= 30} onPress={add} /><ActionButton label="مسح حقول المقطع" secondary onPress={() => { setDraft(emptyNarrationRange()); setError(''); }} /></View>
    {!!error && <AppText accessibilityRole="alert">{error}</AppText>}
    {ranges.map((range, index) => <View key={index} style={{ gap: 8 }}><AppText>{narrationRangeLabel(range, references)}</AppText>
      <ActionButton label={`حذف المقطع ${index + 1}`} secondary onPress={() => setRanges(current => current.filter((_, i) => i !== index))} /></View>)}
    {dirty && <AppText>أضف المقطع المكتوب أو امسح حقوله قبل اعتماد النطاقات.</AppText>}
  </FormDialog><ChoiceDialog visible={!!choice} title={choice === 'startSurah' ? 'سورة بداية مقطع السرد' : 'سورة نهاية مقطع السرد'}
    options={references.chapters.map(chapter => ({ value: String(chapter.number), label: chapter.name }))} value={choice ? draft[choice] : undefined}
    onChoose={value => { if (choice) setDraft(current => ({ ...current, [choice]: value, ...(choice === 'startSurah' ? { startAyah: '', endSurah: value, endAyah: '' } : { endAyah: '' }) })); }} onClose={() => setChoice(null)} /></>;
}
