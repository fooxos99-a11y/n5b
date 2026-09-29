const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

const cleanSurahName = (name, surah) => String(name || `سورة ${surah || ''}`)
  .replace(/^سُورَةُ\s*/u, '')
  .replace(/^سورة\s*/u, '')
  .trim();

const taskEnd = (task) => ({
  page: Number(task.actualToPage || task.toPage || 0),
  surah: Number(task.actualToSurah || task.toSurah || 0),
  ayah: Number(task.actualToAyah || task.toAyah || 0),
  surahName: task.actualToSurahName || task.toSurahName,
  surahAyahCount: Number(task.actualToSurahAyahCount || task.toSurahAyahCount || 0),
});

const compareTaskPosition = (first, second) => {
  const direction = Number(first?.planDirection || second?.planDirection || 1) < 0 ? -1 : 1;
  const firstPosition = [Number(first?.fromPage || 0), Number(first?.fromSurah || 0), Number(first?.fromAyah || 0)];
  const secondPosition = [Number(second?.fromPage || 0), Number(second?.fromSurah || 0), Number(second?.fromAyah || 0)];
  for (let index = 0; index < firstPosition.length; index += 1) {
    if (firstPosition[index] !== secondPosition[index]) return (firstPosition[index] - secondPosition[index]) * direction;
  }
  return String(first?.taskDate || '').localeCompare(String(second?.taskDate || ''));
};

export const sortRecitationTasks = (tasks = []) => [...tasks].sort(compareTaskPosition);

const tasksAreContinuous = (previous, next) => {
  if (String(previous.planId || '') !== String(next.planId || '')) return false;
  if (String(previous.taskDate || '') !== String(next.taskDate || '')) return false;
  if (String(previous.taskType || '') !== String(next.taskType || '')) return false;
  if (String(previous.track || '') !== String(next.track || '')) return false;
  const end = taskEnd(previous);
  const nextPage = Number(next.fromPage || 0);
  const nextSurah = Number(next.fromSurah || 0);
  const nextAyah = Number(next.fromAyah || 0);
  if (!end.page || !nextPage || Math.abs(nextPage - end.page) > 1) return false;
  if (nextSurah === end.surah) return nextAyah === end.ayah + 1;
  return nextSurah === end.surah + 1 && nextAyah === 1;
};

export const groupContinuousRecitationTasks = (tasks = []) => {
  const groups = [];
  sortRecitationTasks(tasks).forEach((task) => {
    const current = groups.at(-1);
    if (current && tasksAreContinuous(current.tasks[current.tasks.length - 1], task)) {
      current.tasks.push(task);
      return;
    }
    groups.push({ tasks: [task] });
  });
  return groups;
};

const taskSegment = (task) => {
  const end = taskEnd(task);
  return {
    fromSurah: Number(task.fromSurah || 0),
    fromAyah: Number(task.fromAyah || 0),
    toSurah: end.surah,
    toAyah: end.ayah,
    fromSurahName: cleanSurahName(task.fromSurahName, task.fromSurah),
    toSurahName: cleanSurahName(end.surahName, end.surah),
    toSurahAyahCount: end.surahAyahCount,
  };
};

const segmentsAreContinuous = (previous, next) => {
  if (previous.toSurah === next.fromSurah) return next.fromAyah === previous.toAyah + 1;
  return next.fromSurah === previous.toSurah + 1
    && next.fromAyah === 1
    && previous.toSurahAyahCount > 0
    && previous.toAyah === previous.toSurahAyahCount;
};

const formatSegment = (segment) => {
  const fromLabel = `${segment.fromSurahName}\u00a0${numberText(segment.fromAyah)}`;
  const toLabel = `${segment.toSurahName}\u00a0${numberText(segment.toAyah)}`;
  if (segment.fromSurah !== segment.toSurah) {
    return `من ${fromLabel} إلى ${toLabel}`;
  }
  if (segment.fromAyah === segment.toAyah) return fromLabel;
  return `من ${fromLabel} إلى ${numberText(segment.toAyah)}`;
};

const formatPageSegment = ({ fromPage, toPage }) => (
  fromPage === toPage
    ? `الوجه ${numberText(fromPage)}`
    : `من ${numberText(fromPage)} إلى ${numberText(toPage)}`
);

const formatContinuousPageRange = (tasks = []) => {
  const segments = [];
  tasks.map((task) => {
    const fromPage = Number(task.fromPage || 0);
    const toPage = Number(task.actualToPage || task.toPage || fromPage);
    return fromPage && toPage ? {
      fromPage: Math.min(fromPage, toPage),
      toPage: Math.max(fromPage, toPage),
    } : null;
  }).filter(Boolean).sort((first, second) => first.fromPage - second.fromPage).forEach((segment) => {
    const previous = segments.at(-1);
    if (previous && segment.fromPage <= previous.toPage + 1) {
      previous.toPage = Math.max(previous.toPage, segment.toPage);
      return;
    }
    segments.push(segment);
  });
  return segments.map(formatPageSegment).join('، ثم ');
};

export const formatContinuousRecitationRange = (tasks = [], referenceMode = 'ayah') => {
  if (referenceMode === 'page') return formatContinuousPageRange(tasks);
  const segments = [];
  sortRecitationTasks(tasks).map(taskSegment).forEach((segment) => {
    const previous = segments.at(-1);
    if (previous && segmentsAreContinuous(previous, segment)) {
      previous.toSurah = segment.toSurah;
      previous.toAyah = segment.toAyah;
      previous.toSurahName = segment.toSurahName;
      previous.toSurahAyahCount = segment.toSurahAyahCount;
      return;
    }
    segments.push({ ...segment });
  });
  return segments.map(formatSegment).join('، ثم ');
};
