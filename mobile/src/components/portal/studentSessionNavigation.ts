import type { ReactNode } from 'react';

export type StudentSessionTab = 'evaluation' | 'saved';
export type StudentSessionTabsProps = { value: StudentSessionTab; onChange: (value: StudentSessionTab) => void; children: ReactNode };
export const studentSessionTabs = [{ value: 'evaluation', label: 'الجلسات' }, { value: 'saved', label: 'محفوظي' }] as const;
