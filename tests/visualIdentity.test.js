import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the palette follows the Nukhab logo: teal primary and gold accent', async () => {
  const [config, css, svg] = await Promise.all([
    read('../src/site/siteConfigs.js'),
    read('../src/index.css'),
    read('../public/branding/nukhab/nukhab-logo.svg'),
  ]);
  assert.match(svg, /fill="#046e65"/);
  assert.match(svg, /fill="#dfa33b"/);
  assert.match(config, /primary: '175 93% 22%'/);
  assert.match(config, /primary: '38 72% 55%'/);
  assert.match(config, /highlight: '#dfa33b'/);
  assert.match(css, /--primary: 175 93% 22%;/);
  for (const source of [config, css]) assert.doesNotMatch(source, /\b195 \d+% \d+%|#003d52|#052e41|#d7a43b/i);
});

test('users page is one card with tabs, a toolbar and divided rows', async () => {
  const [users, students, staff, admins, layout] = await Promise.all([
    read('../src/components/dashboard/UsersSection.jsx'),
    read('../src/components/dashboard/StudentsSection.jsx'),
    read('../src/components/dashboard/CommitteeStaffSection.jsx'),
    read('../src/components/dashboard/AdministratorsSection.jsx'),
    read('../src/components/dashboard/layout/ManagementPanel.jsx'),
  ]);
  assert.match(users, /<ManagementPanel>\s*<ManagementTabs/);
  for (const source of [students, staff, admins]) {
    assert.match(source, /<ManagementToolbar>/);
    assert.match(source, /<ManagementList /);
    assert.match(source, /<ManagementRow/);
    assert.doesNotMatch(source, /<Card\b/);
  }
  assert.match(layout, /role="tablist"/);
  assert.match(layout, /divide-y divide-border/);
  // Logical order: name, circle, login number, phone, national id.
  const order = ['student-name', 'student-committee', 'student-login-number', 'student-phone', 'student-national-id'].map((id) => students.indexOf(`htmlFor="${id}"`));
  assert.ok(order.every((index) => index > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});
