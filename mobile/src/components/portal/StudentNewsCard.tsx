import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import type { StudentNewsEntry } from '../../domain/studentDashboard';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';
import { DashboardButton } from '../dashboard/DashboardButton';
import { NewsArtwork } from '../news/NewsArtwork';
import { StudentResourceStatus, type StudentResource } from './StudentResourceStatus';

export function StudentNewsCard({ resource, onRetry }: { resource: StudentResource<StudentNewsEntry[]>; onRetry: () => void }) {
  const palette = usePalette(); const { width } = useWindowDimensions(); const [index, select] = useState(0);
  const count = resource.value?.length ?? 0; const entry = resource.value?.[index % Math.max(count, 1)];
  if (!entry && !resource.loading && !resource.error) return null;
  return <View accessibilityLabel="الأخبار" style={{ overflow: 'hidden', borderWidth: 1, borderColor: `${palette.primary}26`, borderRadius: 16, backgroundColor: palette.card }}>
    <StudentResourceStatus resource={resource} onRetry={onRetry} />
    {entry && <><NewsArtwork entry={entry} presentation="student" height={width >= 640 ? 320 : 280} />
      {count > 1 && <View style={{ flexDirection: 'row-reverse', justifyContent: 'center', gap: 4 }}>
        <DashboardButton iconOnly icon="chevronRight" label="الخبر السابق" onPress={() => select(value => (value - 1 + count) % count)} />
        <AppText style={{ alignSelf: 'center', fontSize: 12 }}>{index % count + 1} / {count}</AppText>
        <DashboardButton iconOnly icon="chevronLeft" label="الخبر التالي" onPress={() => select(value => (value + 1) % count)} />
      </View>}
    </>}
  </View>;
}
