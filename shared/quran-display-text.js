function replacePaddedMatches(source, pattern, replacement, leadingComma = false) {
  const parts = [];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    let start = match.index;
    while (start > cursor && /\s/.test(source[start - 1])) start -= 1;
    if (leadingComma && start > cursor && source[start - 1] === '،') start -= 1;
    let end = match.index + match[0].length;
    while (end < source.length && /\s/.test(source[end])) end += 1;
    parts.push(source.slice(cursor, start), replacement);
    cursor = end;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}

export function compactQuranAmount(value) {
  const withoutPrefix = replacePaddedMatches(value, /من آية/g, ' ', true);
  const withoutAyah = replacePaddedMatches(withoutPrefix, /آية/g, ' ');
  return replacePaddedMatches(withoutAyah, /إلى/g, '–');
}

export function cleanQuranPreview(value = '') {
  const withoutFace = replacePaddedMatches(String(value || ''), /\(\s*وجه\s*\d+\s*\)/g, '');
  return replacePaddedMatches(withoutFace, /-\s*المطلوب\s*\d+\s*وجه/g, '').trim();
}
