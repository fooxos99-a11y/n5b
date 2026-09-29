export const defaultAccountSection = (role, sections = []) => (
  role === 'supervisor' && sections.some((section) => section.key === 'quranEvaluation')
    ? 'quranEvaluation'
    : sections[0]?.key || ''
);
