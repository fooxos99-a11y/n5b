import type { CallGrant } from '../domain/callGrant';
import { AppText } from '../components/AppText';
import { ProbeCard } from '../components/ProbeCard';

export function CallProbe(_props: { grant?: CallGrant | null }) {
  return <ProbeCard title="المكالمة">
    <AppText>فحص المكالمة يحتاج نسخة تطوير على Android أو iPhone.</AppText>
  </ProbeCard>;
}
