import { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { AppText } from '../AppText';

export interface NewsArtworkEntry { readonly title: string; readonly body?: string; readonly image: string; readonly textColor?: string }
export function NewsArtwork({ entry, expanded = false, height = 280, presentation }: { entry: NewsArtworkEntry; expanded?: boolean; height?: number; presentation?: 'student' }) {
  const [failedSource, setFailedSource] = useState(''); const { width } = useWindowDimensions();
  const student = presentation === 'student'; const wide = width >= 640;
  const color = /^#[\da-f]{6}$/i.test(entry.textColor ?? '') ? entry.textColor! : '#000000';
  const imageVisible = !!entry.image && failedSource !== entry.image;
  const channels = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const brightness = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return <View style={[styles.frame, { backgroundColor: brightness > 140 ? '#0f172a' : '#ffffff' }, expanded ? styles.expanded : [styles.preview, { height }]]}>
    {imageVisible && <Image source={{ uri: entry.image }} resizeMode="cover" style={StyleSheet.absoluteFill}
      accessibilityLabel={`صورة ${entry.title}`} onError={() => setFailedSource(entry.image)} />}
    {imageVisible && <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]} />}
    <View pointerEvents="none" style={[styles.content, student && { padding: wide ? 24 : 20 }]}>
      <AppText accessibilityRole="header" numberOfLines={expanded ? undefined : 2} style={[styles.title,
        student && { fontSize: wide ? 20 : 18, lineHeight: wide ? 28 : 29.25 }, { color }]}>{entry.title}</AppText>
      {!!entry.body && <AppText numberOfLines={expanded ? undefined : 4} style={[styles.body, { color }]}>{entry.body}</AppText>}
      {!!entry.image && failedSource === entry.image && <AppText style={{ color }}>تعذّر عرض الصورة</AppText>}
    </View>
  </View>;
}
const styles = StyleSheet.create({ frame: { width: '100%', backgroundColor: '#0f172a', borderRadius: 12, overflow: 'hidden' },
  preview: { height: 280, justifyContent: 'center' }, expanded: { minHeight: 280 }, overlay: { backgroundColor: '#00000059' },
  content: { padding: 20, gap: 12 }, title: { fontFamily: 'CairoBold', fontSize: 20, lineHeight: 32 }, body: { fontSize: 14, lineHeight: 28 } });
