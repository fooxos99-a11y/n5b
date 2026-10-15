import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { ChoiceDialog } from '../ChoiceDialog';
import { FormField } from '../FormField';
import { screenStyles } from '../ScreenLayout';
import type { PlanManagementData, PlanRangeDraft } from '../../domain/planManagement';
import { useLoadedResource } from '../../hooks/useLoadedResource';
import type { PlanManagementApi } from '../../services/planManagementApi';
import { usePalette } from '../../theme';

function PlanEndpoint({ side, label, value, onChange, data, api, disabled }: {
  side: 'start' | 'end'; label: string; value: PlanRangeDraft; onChange: (patch: Partial<PlanRangeDraft>) => void;
  data: PlanManagementData; api: PlanManagementApi; disabled: boolean;
}) {
  const palette = usePalette(); const [choice, setChoice] = useState<'surah' | 'ayah' | null>(null);
  const surah = value[`${side}Surah`], ayah = value[`${side}Ayah`];
  const loader = useCallback((signal: AbortSignal) => data.settings.referenceMode === 'ayah' && surah
    ? api.ayahs(Number(surah), signal) : Promise.resolve([]), [api, surah, data.settings.referenceMode]);
  const resource = useLoadedResource(loader);
  if (data.settings.referenceMode === 'page') return <FormField label={`${label} الصفحة`} value={value[`${side}Page`]}
    editable={!disabled} keyboardType="number-pad" maxLength={3} onChangeText={text => onChange({ [`${side}Page`]: text })} />;
  return <View style={{ gap: 10 }}>
    <ActionButton label={`${label} السورة: ${data.chapters.find(chapter => String(chapter.number) === surah)?.name || 'اختر السورة'}`}
      secondary disabled={disabled} onPress={() => setChoice('surah')} />
    <ActionButton label={`${label} الآية: ${ayah || 'اختر الآية'}`} secondary disabled={disabled || !surah || resource.loading || !!resource.error}
      onPress={() => setChoice('ayah')} />
    {!!resource.error && <><AppText accessibilityRole="alert" style={{ color: palette.error }}>{resource.error}</AppText>
      <ActionButton label={`إعادة تحميل آيات ${label}`} secondary onPress={() => { void resource.reload(); }} /></>}
    <ChoiceDialog visible={!!choice} title={choice === 'surah' ? `${label} السورة` : `${label} الآية`} value={choice === 'surah' ? surah : ayah}
      options={choice === 'surah' ? data.chapters.map(chapter => ({ value: String(chapter.number), label: chapter.name }))
        : (resource.value ?? []).map(item => ({ value: String(item.ayah), label: `آية ${item.ayah} • صفحة ${item.page}` }))}
      onChoose={text => { if (choice === 'surah') onChange({ [`${side}Surah`]: text, [`${side}Ayah`]: '', [`${side}Page`]: '' });
        else onChange({ [`${side}Ayah`]: text, [`${side}Page`]: String(resource.value?.find(item => String(item.ayah) === text)?.page ?? '') }); }}
      onClose={() => setChoice(null)} />
  </View>;
}
export function PlanRangeFields({ label, value, onChange, data, api, disabled = false }: {
  label: string; value: PlanRangeDraft; onChange: (value: PlanRangeDraft) => void; data: PlanManagementData; api: PlanManagementApi; disabled?: boolean;
}) {
  return <View style={screenStyles.grid}>{(['start', 'end'] as const).map(side => <View key={side} style={screenStyles.field}>
    <PlanEndpoint side={side} label={`${side === 'start' ? 'بداية' : 'نهاية'} ${label}`} value={value}
      onChange={patch => onChange({ ...value, ...patch })} data={data} api={api} disabled={disabled} />
  </View>)}</View>;
}
