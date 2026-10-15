import { useWindowDimensions } from 'react-native';
import { compactQuranAmount } from '../../../../shared/quran-display-text.js';
import type { StudentTask } from '../../domain/studentDashboard';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';

export function StudentTaskAmounts({ tasks, compact = false }: {
  tasks: (Pick<StudentTask, 'amountHidden' | 'amount'> & { id: number | string })[]; compact?: boolean;
}) {
  const palette = usePalette(); const { width } = useWindowDimensions();
  return <>{tasks.map(task => <AppText key={task.id} style={compact ? { fontSize: width >= 640 ? 12 : 10,
    lineHeight: width >= 640 ? 22 : 18, textAlign: 'center', color: palette.muted } : { fontSize: 12, lineHeight: 22.8 }}>
    {task.amountHidden ? 'المقدار مخفي حسب إعدادات الإدارة.' : task.amount ? compact ? compactQuranAmount(task.amount) : task.amount : 'تفاصيل المقدار غير متاحة.'}
  </AppText>)}</>;
}
