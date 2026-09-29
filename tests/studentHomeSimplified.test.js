import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const exists = (path) => access(new URL(path, import.meta.url)).then(() => true, () => false);

test('contact messages are removed from the dashboard, the public pages and the server', async () => {
  const [server, dashboard, routes, api, privacy, registration, footer] = await Promise.all([
    read('../server/index.js'),
    read('../src/pages/WajehDashboard.jsx'),
    read('../src/lib/sectionRoutes.js'),
    read('../src/services/studentsApi.js'),
    read('../src/pages/PrivacyPolicy.jsx'),
    read('../src/pages/PublicRegistration.jsx'),
    read('../src/components/public/PublicLegalFooter.jsx'),
  ]);
  assert.doesNotMatch(server, /contactMessage|contact-messages/i);
  assert.doesNotMatch(dashboard, /ContactMessagesSection|contactMessages/);
  assert.doesNotMatch(routes, /contactMessages|contact-messages/);
  assert.doesNotMatch(api, /submitContactMessage|getContactMessages/);
  assert.doesNotMatch(privacy, /تواصل معنا/);
  assert.doesNotMatch(registration, /تواصل معنا/);
  assert.doesNotMatch(footer, /للتواصل/);
  for (const file of [
    '../src/components/dashboard/ContactMessagesSection.jsx',
    '../src/components/public/PublicContactDialog.jsx',
    '../server/routes/contactMessageRoutes.js',
    '../server/services/contactMessageDelivery.js',
  ]) assert.equal(await exists(file), false, file);
});

test('the student home shows the day amounts side by side without execution or a weekly grade', async () => {
  const [home, today, amounts, news, portal] = await Promise.all([
    read('../src/components/portal/home/StudentHome.jsx'),
    read('../src/components/portal/home/StudentTodayCard.jsx'),
    read('../src/components/portal/home/StudentReadAmounts.jsx'),
    read('../src/components/portal/home/StudentNewsArtwork.jsx'),
    read('../src/pages/AccountPortal.jsx'),
  ]);
  assert.match(amounts, /gridTemplateColumns: `repeat\(\$\{groups\.length\}, minmax\(0, 1fr\)\)`/);
  assert.doesNotMatch(today, /Execution|تنفيذ/);
  assert.doesNotMatch(home, /executionEnabled|StudentHomeGrades|درجتي/);
  assert.doesNotMatch(portal, /quranExecution/);
  assert.doesNotMatch(news, /أخبار العائلة/);
  assert.equal(await exists('../src/components/portal/home/StudentHomeGrades.jsx'), false);
  assert.equal(await exists('../src/components/portal/QuranExecutionDialog.jsx'), false);
});
