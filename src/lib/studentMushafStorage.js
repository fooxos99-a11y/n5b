import { clampMushafPage } from '@/services/offlineMushaf';

const storageKey = (studentId, key) => `nukhab_student_mushaf_${studentId}_${key}`;

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '') || fallback;
  } catch {
    return fallback;
  }
};

export const readStudentMushafState = (studentId) => ({
  lastPage: clampMushafPage(localStorage.getItem(storageKey(studentId, 'last_page')) || 1),
  bookmarks: readJson(storageKey(studentId, 'bookmarks'), [])
    .map(clampMushafPage)
    .filter((page, index, pages) => pages.indexOf(page) === index),
  today: readJson(storageKey(studentId, 'today'), null),
});

export const saveStudentMushafLastPage = (studentId, page) => {
  localStorage.setItem(storageKey(studentId, 'last_page'), String(clampMushafPage(page)));
};

export const saveStudentMushafBookmarks = (studentId, bookmarks) => {
  localStorage.setItem(storageKey(studentId, 'bookmarks'), JSON.stringify(bookmarks));
};

export const saveStudentMushafToday = (studentId, today) => {
  localStorage.setItem(storageKey(studentId, 'today'), JSON.stringify(today));
};
