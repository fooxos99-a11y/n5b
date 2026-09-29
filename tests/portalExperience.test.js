import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { termsContent } from '../shared/legal-content.js';

test('portal account and public rankings match the student experience with notification administration', async () => {
  const [portal, wajehDashboard, accountPrivacy, deletionRoutes, deletionMigration, db, registration, shell, sidebar, ranking, familyMarquee, rankingPoints, coinPoints, legalConsent, login, publicHome, accountLogin, app, terms] = await Promise.all([
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/account/AccountPrivacySection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/accountDeletionRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.24.7-account-deletion-reciters.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PublicRegistration.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardShell.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicRankingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/FamilyRankingMarquee.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/points/RankingPointsValue.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/points/PointsValue.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/legal/LegalConsentText.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHome.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/AccountLoginDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/TermsOfUse.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(portal, /key: 'accountPrivacy'/);
  assert.doesNotMatch(portal, /AccountPrivacySection/);
  assert.doesNotMatch(wajehDashboard, /AccountPrivacySection/);
  assert.match(login, /<AccountLoginPage/);
  assert.match(publicHome, /<PublicLegalFooter/);
  assert.match(login, /const AccountDeletionDialog = lazy/);
  assert.match(login, /deletionPage && storedUser[\s\S]*<AccountDeletionDialog open onOpenChange=/);
  assert.doesNotMatch(portal, /const AccountPrivacySection = lazy/);
  assert.doesNotMatch(wajehDashboard, /const AccountPrivacySection = lazy/);
  assert.match(accountPrivacy, /if \(isLoading && \(!compact \|\| embeddedConfirmation\)\)/);
  assert.match(accountPrivacy, />إلغاء<\/Button>/);
  assert.match(accountPrivacy, />تأكيد<\/Button>/);
  assert.match(accountPrivacy, /طلب حذف الحساب/);
  assert.match(accountPrivacy, /variant="destructive"/);
  assert.match(accountPrivacy, /variant="link"/);
  assert.doesNotMatch(accountPrivacy, /نهائيًا|<LegalConsentText/);
  assert.doesNotMatch(accountPrivacy, /سيصل الطلب إلى|بعد المراجعة سيُحذف الحساب/);
  assert.doesNotMatch(shell, /logoutDialogOpen|openAccountDialog|خيارات الحساب/);
  assert.match(shell, /onLogout=\{onLogout\}/);
  assert.match(sidebar, /onClick=\{onLogout\}/);
  assert.match(sidebar, /<LogOut/);
  assert.match(sidebar, /تسجيل الخروج/);
  assert.doesNotMatch(sidebar, /UserCircle|onOpenAccount/);
  assert.doesNotMatch(accountPrivacy, /border-t border-border\/70|hover:bg-destructive/);
  assert.match(accountPrivacy, /request && !compact/);
  assert.match(accountPrivacy, /variant=\{compact \? 'link' : 'outline'\}/);
  assert.match(deletionRoutes, /'student', 'supervisor', 'admin', 'reciter', 'manager'/);
  assert.match(deletionMigration, /MODIFY COLUMN user_role ENUM\('student', 'supervisor', 'admin', 'reciter', 'manager'\)/);
  assert.match(db, /ENUM\('student', 'supervisor', 'admin', 'reciter', 'manager'\)/);
  assert.doesNotMatch(registration, /إدارة المجمعات القرآنية|الالتحاق بالمجمع|أدخل بيانات الطالب|بإرسال الطلب|LegalConsentText/);
  assert.match(login, /<AccountLoginPage/);
  assert.doesNotMatch(accountLogin, /LegalConsentText|بتسجيل دخولك/);
  assert.match(accountLogin, /w-\[calc\(100vw-2rem\)\] max-w-md/);
  assert.match(legalConsent, /to="\/terms">شروط الاستخدام/);
  assert.match(legalConsent, /to="\/privacy">سياسة الخصوصية/);
  assert.match(app, /path="\/terms" component=\{TermsOfUse\}/);
  assert.match(terms, /<PublicInfoLayout title=\{termsContent.title\} showSiteName=\{false\}>/);
  assert.equal(termsContent.title, 'شروط الاستخدام');
  assert.match(terms, /termsContent.sections.map/);
  assert.match(JSON.stringify(termsContent), /من قائمة حساب الطالب أو أسفل الصفحة الرئيسية/);
  assert.doesNotMatch(shell, /accountContent/);
  assert.match(sidebar, /section\.badge/);
  assert.doesNotMatch(sidebar, /إدارة المجمعات القرآنية/);
  assert.match(sidebar, /const sidebarLogo = resolveAssetUrl\(site\.whiteLogo \|\| site\.logo\);/);
  assert.match(sidebar, /h-\[4\.25rem\] w-\[4\.6rem\]/);
  assert.doesNotMatch(sidebar, /<Link|href="\/"|العودة للصفحة الرئيسية/);
  assert.match(sidebar, /src=\{sidebarLogo\}/);
  assert.equal((sidebar.match(/border-white\/\[0\.06\]/g) || []).length, 2);
  assert.doesNotMatch(sidebar, /border-white\/15/);
  assert.doesNotMatch(sidebar, /h-\[5rem\] w-\[5\.4rem\]/);
  assert.doesNotMatch(sidebar, />\{title\}<\/div>/);
  assert.match(portal, /headerContent=\{headerContent\}/);
  assert.doesNotMatch(portal, /bestStudents|StudentRankingSection/);
  assert.match(ranking, /items\.slice\(0, 20\)/);
  assert.match(familyMarquee, /animate-nukhab-family-marquee/);
  assert.match(familyMarquee, /Math\.ceil\(8 \/ items\.length\)/);
  assert.match(ranking, /<PublicHeroBackground \/>/);
  assert.match(`${ranking}\n${familyMarquee}`, /rank === 1/);
  assert.match(`${ranking}\n${familyMarquee}`, /rank === 2/);
  assert.match(`${ranking}\n${familyMarquee}`, /rank === 3/);
  assert.match(ranking, /أفضل الطلاب/);
  assert.ok(ranking.indexOf('<FamilyRankingMarquee') < ranking.indexOf('<StudentRankingList'));
  assert.match(familyMarquee, /أفضل الحلقات/);
  assert.match(ranking, /rankingPointsVisible !== false/);
  assert.match(familyMarquee, /لا توجد بيانات ترتيب للحلقات حاليًا/);
  assert.match(ranking, /لا توجد بيانات ترتيب للطلاب حاليًا/);
  assert.match(rankingPoints, /PointIcon/);
  assert.doesNotMatch(rankingPoints, /CoinIcon/);
  assert.match(coinPoints, /CoinIcon/);
  assert.doesNotMatch(portal, /NotificationsSection|useAppNotificationPolling|key: 'notifications'/);
  assert.match(wajehDashboard, /key: 'notifications'/);
  assert.match(wajehDashboard, /<NotificationsSection/);
});

test('student login is tracked and teacher tasks carry repeat counts', async () => {
  const [server, db, auth] = await Promise.all([
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/tenantAuthRoutes.js', import.meta.url), 'utf8'),
  ]);

  assert.match(db, /last_login_at/);
  assert.match(auth, /UPDATE students SET last_login_at = NOW\(\)/);
  assert.match(server, /t\.actual_repeat_count AS actualRepeatCount/);
  assert.match(server, /actualRepeatCount: row\.actualRepeatCount/);
});

test('mobile management screens keep fixed chrome and simplified portrait controls', async () => {
  const [shell, reports, whatsapp] = await Promise.all([
    readFile(new URL('../src/components/dashboard/DashboardShell.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/WhatsAppSendSection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(shell, /<div className="min-h-\[100dvh\]/);
  assert.match(shell, /dashboard-header fixed/);
  assert.match(shell, /dashboard-main min-h-\[100dvh\]/);
  assert.doesNotMatch(shell, /dashboard-main[^"\n]*overflow-y-auto/);
  assert.doesNotMatch(reports, /studentsApi\.getStudents|setStudentId|value=\{studentId\}/);
  // No export on the reports page; the period selector sits in the header on every screen.
  assert.doesNotMatch(reports, /renderExportMenu|exportOverviewReport|sendReportWhatsApp|DashboardMobileHeaderActions/);
  assert.match(reports, /<SelectTrigger aria-label="الفترة"/);
  assert.match(shell, /id=\{MOBILE_HEADER_ACTIONS_ID\} className="min-w-0"/);
  const recipientFilters = await readFile(new URL('../src/components/dashboard/MessageRecipientFilters.jsx', import.meta.url), 'utf8');
  assert.match(whatsapp, /<MessageRecipientFilters/);
  assert.match(recipientFilters, /grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_44px\]/);
  assert.equal((recipientFilters.match(/className="h-11 w-full min-w-0 \[&_span\]:truncate"/g) || []).length, 2);
});
