import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import page1 from '../../../public/quran/hafs/pages/1.json';
import page2 from '../../../public/quran/hafs/pages/2.json';
import page604 from '../../../public/quran/hafs/pages/604.json';
import layout1 from '../../../public/quran/hafs/layout-v1/1.json';
import layout2 from '../../../public/quran/hafs/layout-v1/2.json';
import layout604 from '../../../public/quran/hafs/layout-v1/604.json';
import fontManifest from '../../assets/fonts/manifest.json';
import { makeNativeLines, makeNativeWords, selectWord, selectedWords, selectionText, type Selection } from '../domain/mushaf';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ProbeCard } from '../components/ProbeCard';
import { usePalette } from '../theme';

const samples = [
  { page: page1, layout: layout1 }, { page: page2, layout: layout2 }, { page: page604, layout: layout604 },
];
type FontMetrics = { unitsPerEm: number; glyphAdvance: Record<string, number> };
const metrics: Record<string, FontMetrics> = fontManifest.fonts;
const basmala = makeNativeWords(page1, layout1).filter(word => word.verseKey === '1:1' && word.charType === 'word');

export function MushafProbe() {
  const palette = usePalette();
  const [pageIndex, setPageIndex] = useState(0);
  const [width, setWidth] = useState(280);
  const [selection, setSelection] = useState<Selection>(null);
  const sample = samples[pageIndex] ?? samples[0]!;
  const words = useMemo(() => makeNativeWords(sample.page, sample.layout), [sample]);
  const selected = useMemo(() => new Set(selectedWords(selection, words).map(word => word.location)), [selection, words]);
  const lines = useMemo(() => makeNativeLines(sample.page, words), [sample, words]);
  function navigate(index: number) { setSelection(null); setPageIndex(index); }

  return <ProbeCard title="المصحف">
    <AppText style={{ color: palette.muted }}>حدّد كلمة، ثم كلمة أخرى لتظليل النطاق بينهما.</AppText>
    <View style={[styles.mushaf, { backgroundColor: palette.mushaf, borderColor: palette.border }]}
      onLayout={event => setWidth(Math.max(100, event.nativeEvent.layout.width - 32))}>
      {lines.map(line => {
        const advance = line.words.reduce((sum, word) => {
          const font = metrics[String(word.pageV1)];
          return sum + (font?.glyphAdvance[String(word.codeV1.codePointAt(0))] ?? 1000) / (font?.unitsPerEm ?? 1000);
        }, 0);
        const fontSize = Math.min(40, width / Math.max(advance + line.words.length * 0.08, 1));
        return <View key={line.line}>
          {line.decorations.map(item => item.type === 'surah'
            ? <AppText key={`${item.line}-surah`} style={styles.surah}>سورة {item.name}</AppText>
            : item.type === 'bismillah' ? <View key={`${item.line}-basmala`} style={styles.line}>
              {basmala.map(word => <Text key={word.location} accessibilityLabel={word.textQpcHafs}
                style={{ fontFamily: 'QcfV1P1', fontSize: 24, lineHeight: 42, color: palette.text }}>{word.codeV1}</Text>)}
            </View> : null)}
          <View style={styles.line}>
          {line.words.map(word => <Pressable key={word.location}
            accessibilityRole={word.charType === 'word' ? 'button' : 'text'}
            accessibilityLabel={`${word.textQpcHafs}${selected.has(word.location) ? '، محددة' : ''}`}
            accessibilityState={{ selected: selected.has(word.location) }}
            disabled={word.charType !== 'word'}
            onPress={() => setSelection(current => selectWord(current, word.location, words))}
            style={[styles.word, { backgroundColor: selected.has(word.location) ? palette.selected : 'transparent' }]}>
            <Text allowFontScaling={false} style={{ fontFamily: `QcfV1P${word.pageV1}`, fontSize,
              color: palette.text, lineHeight: fontSize * 1.7, writingDirection: 'ltr' }}>{word.codeV1}</Text>
          </Pressable>)}
          </View>
        </View>;
      })}
      <AppText style={styles.pageNumber}>صفحة {sample.page.page}</AppText>
    </View>
    <View style={styles.controls}>
      <ActionButton label="الصفحة التالية" secondary disabled={pageIndex === samples.length - 1} onPress={() => navigate(pageIndex + 1)} />
      <ActionButton label="الصفحة السابقة" secondary disabled={pageIndex === 0} onPress={() => navigate(pageIndex - 1)} />
    </View>
    <AppText accessibilityLiveRegion="polite">{selectionText(selection, words) || 'لم تحدّد نصًا بعد.'}</AppText>
    <ActionButton label="مسح التحديد" secondary disabled={!selection} onPress={() => setSelection(null)} />
  </ProbeCard>;
}
const styles = StyleSheet.create({ mushaf: { padding: 16, borderWidth: 1, borderRadius: 18 },
  surah: { fontFamily: 'CairoBold', fontSize: 19, lineHeight: 34, textAlign: 'center', marginBottom: 12 },
  line: { direction: 'ltr', flexDirection: 'row-reverse', justifyContent: 'center', alignItems: 'center' },
  word: { paddingHorizontal: 1, minHeight: 44, justifyContent: 'center', borderRadius: 5 },
  pageNumber: { textAlign: 'center', marginTop: 10, fontSize: 13 },
  controls: { direction: 'ltr', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 } });
