import { formatQuranSelectionText } from '../../../shared/quranSelectionText.js';

export type MushafWord = {
  id: number; location: string; verseKey: string; charType: string; textQpcHafs: string;
};
export type DisplayWord = { codeV1: string; pageV1: number; lineV1: number };
export type PageData = { page: number; words: MushafWord[];
  decorations: { line: number; type: string; name?: string }[] };
export type PageLayout = { page: number; words: Record<string, DisplayWord> };
export type NativeWord = MushafWord & DisplayWord;
export type Selection = { anchor: string; end: string | null } | null;
export function makeNativeLines(page: PageData, words: NativeWord[]) {
  const numbers = [...new Set([...words.map(word => word.lineV1), ...page.decorations.map(item => item.line)])].sort((a, b) => a - b);
  return numbers.map(line => ({ line, words: words.filter(word => word.lineV1 === line),
    decorations: page.decorations.filter(item => item.line === line) }));
}

export function makeNativeWords(page: PageData, layout: PageLayout): NativeWord[] {
  if (page.page !== layout.page) throw new Error('صفحة المصحف لا تطابق تخطيط العرض.');
  return page.words.map(word => {
    const display = layout.words[word.location];
    if (!display?.codeV1 || !Number.isInteger(display.pageV1) || !Number.isInteger(display.lineV1)) {
      throw new Error('بيانات عرض المصحف غير مكتملة.');
    }
    return { ...word, ...display };
  });
}

export function selectWord(current: Selection, location: string, words: NativeWord[]): Selection {
  const word = words.find(item => item.location === location);
  if (!word || word.charType !== 'word') return current;
  if (!current || current.end || !words.some(item => item.location === current.anchor)) {
    return { anchor: location, end: null };
  }
  return { anchor: current.anchor, end: location };
}

export function selectedWords(selection: Selection, words: NativeWord[]): NativeWord[] {
  if (!selection) return [];
  const start = words.findIndex(word => word.location === selection.anchor);
  const end = words.findIndex(word => word.location === (selection.end ?? selection.anchor));
  if (start < 0 || end < 0) return [];
  return words.slice(Math.min(start, end), Math.max(start, end) + 1).filter(word => word.charType === 'word');
}

export function selectionText(selection: Selection, words: NativeWord[]): string {
  return formatQuranSelectionText(selectedWords(selection, words));
}
