import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('RTL setting toggles place the thumb on the left only when enabled', async () => {
  const toggle = await readFile(new URL('../src/components/ui/setting-toggle.jsx', import.meta.url), 'utf8');

  assert.match(toggle, /checked \? 'translate-x-0' : 'translate-x-5'/);
});

test('management actions share subtle borders and family preview shows contact details only', async () => {
  const [iconButton, reports, students, plans, families, staff, server] = await Promise.all([
    readFile(new URL('../src/components/ui/management-icon-button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/FamiliesSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/CommitteeStaffSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(iconButton, /variant="outline"/);
  assert.match(iconButton, /border-border\/70 shadow-none/);
  assert.doesNotMatch(iconButton, /border-destructive\/50/);
  // Reports are one overview: the period in the header, the circle above the indicator cards.
  // The period sits on the right of the page, next to the circle filter, not in the header.
  assert.doesNotMatch(reports, /DashboardHeaderFilters/);
  assert.match(reports, /aria-label="الفترة"[\s\S]*aria-label="الحلقة"/);
  assert.match(reports, /aria-label="الحلقة"[\s\S]*<section aria-label="مؤشرات الأداء" className=\{`grid grid-cols-2 gap-4 md:grid-cols-3/);
  const controls = reports.match(/const controlClassName = '([^']+)'/)?.[1].split(' ') || [];
  for (const style of ['h-11', 'min-w-0', 'flex-1', 'basis-0', 'text-xs', 'sm:text-sm', 'sm:w-56', 'sm:flex-none', '[&_span]:truncate']) {
    assert.ok(controls.includes(style), `Report filters must retain ${style} for the shared mobile row and desktop sizing`);
  }
  for (const source of [students, plans, families, staff]) {
    assert.match(source, /ManagementIconButton/);
  }
  assert.match(families, /student\.guardianPhone/);
  assert.doesNotMatch(families, /student\.points/);
  assert.match(server, /guardian_phone AS guardianPhone[\s\S]*FROM students[\s\S]*WHERE committee_id = \?/);
});

test('the sidebar selection is a borderless translucent fill', async () => {
  const sidebar = await readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8');

  assert.match(sidebar, /\? 'bg-white\/15 text-white'/);
  assert.match(sidebar, /var\(--brand-navigation-accent\)/);
  assert.doesNotMatch(sidebar, /border-\[#f0bd55\]|shadow-\[0_8px_22px/);
});

test('gold action buttons keep white labels across shared and custom surfaces', async () => {
  const [button, datePicker] = await Promise.all([
    readFile(new URL('../src/components/ui/button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/date-picker.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(button, /bg-primary !text-white/);
  assert.match(datePicker, /bg-primary !text-white/);
});
