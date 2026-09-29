import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('legal pages hide the site name and carry no contact channel', async () => {
  const [layout, terms, privacy, login] = await Promise.all([
    readFile(new URL('../src/components/legal/PublicInfoLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/TermsOfUse.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PrivacyPolicy.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(layout, /showSiteName &&/);
  assert.match(terms, /showSiteName=\{false\}/);
  assert.match(privacy, /showSiteName=\{false\}/);
  assert.doesNotMatch(privacy, /PublicContactDialog|setContactOpen|تواصل معنا/);
  assert.doesNotMatch(privacy, /wa\.me|whatsappUrl/);
  assert.match(privacy, /من قائمة حساب الطالب داخل التطبيق أو رابط «طلب حذف الحساب» في تذييل الصفحة الرئيسية/);
  assert.doesNotMatch(privacy, /فتح أيقونة الحساب وتقديم طلب حذف/);
  assert.doesNotMatch(privacy, /عزل بيانات المجمعات|حسابات القاصرين/);
  assert.doesNotMatch(privacy, /to="\/support"|>الدعم<\/Link>/);
  assert.doesNotMatch(login, /WhatsAppIcon|wa\.me\/966539599222/);
});
