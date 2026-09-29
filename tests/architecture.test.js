import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';

test('WhatsApp barcode startup is bounded and recoverable', async () => {
  const serverText = await readFile(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(serverText, /WHATSAPP_INITIALIZATION_TIMEOUT_MS/);
  assert.match(serverText, /Promise\.race\(\[[\s\S]*client\.initialize\(\)/);
  assert.match(serverText, /runtime\.initializingClient/);
  assert.match(serverText, /status = 'auth_failure'[\s\S]*أنشئ باركودًا جديدًا/);
  assert.match(serverText, /app\.get\('\/api\/whatsapp\/status'[\s\S]*status = 'error'/);
});

test('production assets and dashboard routes use the same root base', async () => {
  const [mainSource, productionEnv] = await Promise.all([
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../.env.nukhab', import.meta.url), 'utf8'),
  ]);

  assert.match(productionEnv, /^BASE_URL=\/$/m);
  assert.match(mainSource, /window\.location\.pathname === buildBasePath/);
  assert.match(mainSource, /window\.location\.pathname\.startsWith\(`\$\{buildBasePath\}\//);
  assert.match(mainSource, /\? buildBasePath\s*:\s*undefined/);
});

test('router dependency and PWA cache contract stay consistent', async () => {
  const [packageText, mainText, serviceWorkerText] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.dependencies['react-router-dom'], undefined);
  assert.equal(packageJson.dependencies.wouter, '^3.10.0');
  assert.match(mainText, /const pwaVersion = `\$\{initialSite\.key\}-pwa-v38`/);
  assert.match(serviceWorkerText, /const CACHE_VERSION = 44/);
  assert.match(serviceWorkerText, /\.slice\(0, 3\)/);
  assert.match(serviceWorkerText, /withBase\('index\.html'\)/);
  assert.doesNotMatch(mainText, /addEventListener\('controllerchange'/);
  assert.match(mainText, /addEventListener\('vite:preloadError'/);
  assert.doesNotMatch(mainText, /keys\.filter\(\(key\) => key\.includes\('-pwa-'\)\)/);
});

test('shared mobile actions keep accessible touch targets and the UI font token', async () => {
  const [
    toastText,
    ownerToolbarText,
    loginText,
    dashboardText,
    shellText,
    registrationText,
    settingsText,
    multiSelectText,
    datePickerText,
    reportsText,
    whatsappText,
    callsText,
    buttonText,
    attendanceText,
    studentsText,
    studentPlansText,
    registrationRequestsText,
    messageTemplateText,
    privacyText,
    legalConsentText,
    accountLoginText,
    selectText,
    popoverText,
  ] = await Promise.all([
    readFile(new URL('../src/components/ui/toast.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/owner/OwnerComplexToolbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardShell.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PublicRegistration.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/multi-select-setting.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/date-picker.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ReportsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/WhatsAppSendSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/calls/AudioCallRoom.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/ManualAttendanceSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/StudentPlansSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/RegistrationRequestsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/MessageTemplateField.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/PrivacyPolicy.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/legal/LegalConsentText.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/AccountLoginDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/select.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/popover.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(toastText, /aria-label="إغلاق الإشعار"/);
  assert.match(toastText, /\bh-11 w-11\b/);
  assert.match(ownerToolbarText, /\bmin-w-11\b/);
  assert.match(ownerToolbarText, /aria-label="إضافة مجمع"/);
  assert.match(registrationText, /\bh-11 w-11\b[^>]*aria-label="حذف"/);
  assert.doesNotMatch(registrationText, /إدارة المجمعات القرآنية|الالتحاق بالمجمع|أدخل بيانات الطالب|بإرسال الطلب|LegalConsentText/);
  assert.match(loginText, /<AccountLoginPage/);
  assert.doesNotMatch(accountLoginText, /LegalConsentText|بتسجيل دخولك/);
  assert.match(legalConsentText, /stacked \? '-mt-1 flex items-center justify-center gap-1'/);
  assert.match(legalConsentText, /to="\/terms">شروط الاستخدام/);
  assert.match(legalConsentText, /to="\/privacy">سياسة الخصوصية/);
  assert.match(messageTemplateText, /\bflex h-11 w-11\b/);
  assert.match(multiSelectText, /\bmin-h-11 w-full\b/);
  assert.match(multiSelectText, /\[font-family:var\(--font-ui\)\]/);
  assert.match(multiSelectText, /overflow-y-auto overscroll-contain[\s\S]*touch-pan-y \[-webkit-overflow-scrolling:touch\]/);
  assert.match(selectText, /SelectPrimitive\.Viewport[\s\S]*overflow-y-auto overscroll-contain[\s\S]*touch-pan-y \[-webkit-overflow-scrolling:touch\]/);
  assert.match(popoverText, /overscroll-contain[\s\S]*touch-pan-y \[-webkit-overflow-scrolling:touch\]/);
  const settingsContent = settingsText.slice(settingsText.indexOf('<CardContent'));
  assert.doesNotMatch(settingsContent, /قوالب التسجيل/);
  assert.doesNotMatch(registrationRequestsText, /RegistrationTemplatesDialog/);
  assert.match(settingsContent, /NotificationSettings/);
  assert.match(datePickerText, /grid grid-cols-7 gap-0\.5/);
  assert.match(datePickerText, /'flex h-11 min-w-0/);
  assert.match(reportsText, /className="h-11 gap-2 text-destructive/);
  assert.match(whatsappText, /className="h-11 w-11 shrink-0/);
  assert.match(whatsappText, /inline-flex h-11 cursor-pointer/);
  assert.match(whatsappText, /failedWhatsAppStatuses/);
  assert.match(whatsappText, /إنشاء باركود جديد/);
  assert.match(whatsappText, /resetWhatsAppBarcode/);
  assert.match(callsText, /className="h-11 w-11 shrink-0"/);
  assert.match(buttonText, /sm: 'h-11 min-h-11/);
  assert.match(attendanceText, /SelectTrigger[^>]+className="h-11/);
  assert.match(studentsText, /aria-label="اختر الحلقة" className="h-11/);
  assert.match(studentPlansText, /className="h-11 border-0/);
  assert.match(registrationRequestsText, /inline-flex h-11 items-center/);
  assert.doesNotMatch(privacyText, /<button/);
  for (const source of [loginText, dashboardText, shellText]) {
    assert.doesNotMatch(source, /font-\['Cairo'/);
    assert.match(source, /\[font-family:var\(--font-ui\)\]/);
  }
});

test('settings use touch-friendly nested sidebar navigation instead of in-page disclosures', async () => {
  const [settings, sidebar, panel] = await Promise.all([
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsCategoryPanel.jsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(settings, /SettingsCategoryPanel category="settingsAttendance"/);
  assert.match(settings, /SettingsCategoryPanel category="settingsNarration"/);
  assert.doesNotMatch(`${settings}\n${panel}`, /<details|<summary/);
  assert.match(sidebar, /section\.children/);
  assert.match(sidebar, /aria-expanded/);
  assert.match(sidebar, /min-h-11/);
  assert.match(sidebar, /ChevronDown/);
});

test('native launch screens use a loading indicator without flashing the brand logo', async () => {
  const splashDirectory = new URL('../ios/App/App/Assets.xcassets/Splash.imageset/', import.meta.url);
  const [contentsText, files, storyboard, androidTheme, androidLoader, capacitorConfig] = await Promise.all([
    readFile(new URL('Contents.json', splashDirectory), 'utf8'),
    readdir(splashDirectory),
    readFile(new URL('../ios/App/App/Base.lproj/LaunchScreen.storyboard', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/res/values/styles.xml', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/res/drawable/splash_loading.xml', import.meta.url), 'utf8'),
    readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8'),
  ]);
  const contents = JSON.parse(contentsText);
  const referencedImages = contents.images.map((image) => image.filename).filter(Boolean).sort();
  const imageFiles = files.filter((file) => file.endsWith('.png')).sort();

  assert.deepEqual(imageFiles, referencedImages);
  assert.doesNotMatch(imageFiles.join('\n'), /splash-2732|capacitor/i);
  assert.match(storyboard, /activityIndicatorView[\s\S]*animating="YES"/);
  assert.doesNotMatch(storyboard, /image="Splash"/);
  assert.match(androidTheme, /windowSplashScreenAnimatedIcon">@drawable\/splash_loading/);
  assert.match(androidLoader, /strokeColor="#046E65"/);
  assert.match(capacitorConfig, /"launchShowDuration": 0/);
  assert.match(capacitorConfig, /"showSpinner": false/);
});

test('install icons use opaque branded artwork instead of a transparent fallback', async () => {
  const icons = [
    { path: '../public/branding/nukhab/icon-192.png', size: 192 },
    { path: '../public/branding/nukhab/icon-512.png', size: 512 },
    { path: '../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', size: 1024 },
    { path: '../android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', size: 192 },
  ];

  for (const icon of icons) {
    const image = await readFile(new URL(icon.path, import.meta.url));
    assert.equal(image.readUInt32BE(16), icon.size);
    assert.equal(image.readUInt32BE(20), icon.size);
    assert.equal(image[25], 2, `${icon.path} must be opaque RGB without transparency`);
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let teal = 0;
    let gold = 0;
    for (let index = 0; index < data.length; index += info.channels) {
      const [r, g, b] = data.subarray(index, index + 3);
      if (g > r * 1.5 && b > r * 1.5 && g < 180) teal++;
      if (r > 150 && g > 90 && b < 110 && r > g) gold++;
    }
    assert.ok(teal > icon.size && gold > icon.size, `${icon.path} must contain both brand colors`);
  }

  const androidBackground = await readFile(
    new URL('../android/app/src/main/res/values/ic_launcher_background.xml', import.meta.url),
    'utf8',
  );
  assert.match(androidBackground, /#F7FAF6/);

  const generator = await readFile(
    new URL('../scripts/generate-nukhab-brand-assets.mjs', import.meta.url),
    'utf8',
  );
  assert.match(generator, /logoUrl = colorLogoUrl/);
  assert.match(generator, /logoScale: 1, logoUrl: appLogoUrl/);
});

test('Nukhab identity is shared across web and native', async () => {
  const [sources, sidebarText, buttonText, colorLogo, whiteLogo, xcodeProject] = await Promise.all([
    Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
    readFile(new URL('../src/site/siteConfigs.js', import.meta.url), 'utf8'),
    readFile(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/res/values/strings.xml', import.meta.url), 'utf8'),
    ]),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../public/branding/nukhab/nukhab-color.png', import.meta.url)),
    readFile(new URL('../public/branding/nukhab/nukhab-white.png', import.meta.url)),
    readFile(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8'),
  ]);

  for (const source of [sources[0], sources[1], sources[2], sources[4], xcodeProject]) {
    assert.match(source, /نخب/);
    assert.doesNotMatch(source, /مدارك|مدارج|الحبيب ماب|رواسي/);
  }
  assert.match(sources[3], /\$\(APP_DISPLAY_NAME\)/);
  assert.match(sources[3], /\$\(BACKGROUND_TASK_IDENTIFIER\)/);
  assert.match(sources[0], /rel="icon" type="image\/svg\+xml"[^>]+branding\/nukhab\/nukhab-logo\.svg\?v=29/);
  assert.match(sources[0], /rel="icon" type="image\/png"[^>]+branding\/nukhab\/icon-192\.png\?v=29/);
  assert.match(sources[0], /rel="apple-touch-icon"[^>]+branding\/nukhab\/icon-192\.png\?v=29/);
  assert.match(sources[2], /logo: 'branding\/nukhab\/nukhab-color-640\.webp'/);
  assert.match(sources[2], /logoSmall: 'branding\/nukhab\/nukhab-color-320\.webp'/);
  assert.match(sources[2], /whiteLogo: 'branding\/nukhab\/nukhab-white-640\.webp'/);
  assert.match(sources[2], /lockupLogo: 'branding\/nukhab\/nukhab-color-640\.webp'/);
  for (const source of [sources[0], sources[1], sources[2]]) assert.doesNotMatch(source, /rawasi|alhabib/);
  assert.equal(colorLogo.readUInt32BE(16), 1254);
  assert.equal(whiteLogo.readUInt32BE(16), 1254);
  const publicHeaderText = await readFile(new URL('../src/components/public/PublicHeader.jsx', import.meta.url), 'utf8');
  assert.match(publicHeaderText, /window\.scrollY > 10/);
  assert.match(publicHeaderText, /data-public-header=\{isScrolled \? 'solid' : 'overlay'\}/);
  assert.match(publicHeaderText, /isScrolled[\s\S]*site\.markLogo \|\| site\.logo[\s\S]*site\.whiteLogo/);
  assert.doesNotMatch(publicHeaderText, /brightness-0 invert/);
  assert.doesNotMatch(publicHeaderText, /ThemeToggle/);
  assert.match(publicHeaderText, /border-primary\/10 bg-white/);
  assert.match(publicHeaderText, /border-transparent bg-transparent/);
  const publicLoginText = await readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8');
  assert.match(publicLoginText, /<AccountLoginPage/);
  assert.doesNotMatch(publicLoginText, /<PublicHeroSection|<PublicRankingsSection/);
  assert.doesNotMatch(publicLoginText, /<h1/);
  assert.match(sidebarText, /bg-\[var\(--brand-navigation\)\]/);
  assert.match(sidebarText, /bg-\[var\(--brand-navigation-highlight\)\]/);
  assert.match(buttonText, /bg-primary/);
  assert.match(buttonText, /bg-primary !text-white/);
  assert.match(buttonText, /hover:!text-white/);
  assert.match(sidebarText, /resolveAssetUrl\(site\.whiteLogo \|\| site\.logo\)/);
  assert.match(sidebarText, /absolute right-4 h-\[4\.25rem\] w-\[4\.6rem\]/);
  assert.doesNotMatch(sidebarText, /brightness-0 invert/);
  assert.match(sidebarText, /bg-white\/15 text-white/);
  assert.match(sidebarText, /isActive \? 'text-white' : 'text-\[var\(--brand-navigation-accent\)\]'/);
  assert.doesNotMatch(sidebarText, /branding\/(?:madarik|madarij|nukhab)/);
});

test('public login uses one account number, public rankings, and direct account navigation', async () => {
  const [app, login, loginDialog, publicHeader, publicRankings, settings, api, authRoutes, server, rankingsMigration] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/AccountLoginDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicHeader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicRankingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/tenantAuthRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.08.17.1-rankings-visibility.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(app, /PlatformOwner|dashboard\/platform/);
  assert.match(login, /<AccountLoginPage/);
  assert.match(login, /<AccountLoginPage/);
  assert.doesNotMatch(login, /<PublicRankingsSection/);
  assert.match(login, /storedUser &&[\s\S]*redirectForUser\(storedUser, navigate, site\.features\?\.studentHome\)/);
  assert.match(login, /navigate\(studentHome \? '\/' : '\/portal', \{ replace: true \}\)/);
  assert.match(login, /user\.role === 'student'[\s\S]*navigate\(studentHome \? '\/' : '\/portal'/);
  assert.doesNotMatch(login, /isRestoringSession|<LoadingScreen/);
  assert.match(publicHeader, /hasSession \? 'فتح الحساب' : 'فتح تسجيل الدخول'/);
  assert.match(publicRankings, /studentRankingsVisible/);
  assert.match(publicRankings, /familyRankingsVisible/);
  assert.match(settings, /label="إظهار ترتيب الطلاب"/);
  assert.match(settings, /label="إظهار ترتيب الحلقات"/);
  assert.doesNotMatch(settings, /صفحات النظام|platformAccessSettings/);
  const loginForm = await readFile(new URL('../src/components/public/AccountLoginForm.jsx', import.meta.url), 'utf8');
  assert.match(loginDialog, /<AccountLoginForm/);
  assert.match(loginForm, />رقم الدخول /);
  assert.match(loginDialog, /<DialogTitle className="sr-only">تسجيل الدخول<\/DialogTitle>/);
  assert.doesNotMatch(loginDialog, /text-center text-2xl font-black[^>]*>تسجيل الدخول/);
  assert.match(loginForm, /<PasswordInput/);
  assert.match(loginForm, /className="account-login-submit"/);
  assert.doesNotMatch(loginDialog, /رقم المجمع|registrationNumber/);
  assert.match(api, /body: JSON\.stringify\(\{ loginNumber, password \}\)/);
  assert.match(authRoutes, /getDatabaseContext\(\)\.tenant/);
  assert.doesNotMatch(authRoutes, /req\.body\.registrationNumber|findComplexByRegistration/);
  assert.match(server, /standaloneDatabaseName[\s\S]*runWithDatabase\(standaloneDatabaseName/);
  assert.match(server, /if \(!settings\.studentRankingsVisible\)/);
  assert.match(server, /if \(!settings\.familyRankingsVisible\)/);
  assert.match(server, /platformFeatureSettingKeys\.forEach\(\(key\) => \{\s*settings\[key\] = true;/);
  assert.match(rankingsMigration, /SELECT 'studentRankingsVisible'/);
  assert.match(rankingsMigration, /SELECT 'familyRankingsVisible'/);
  assert.match(server, /process\.env\.NODE_ENV === 'production' \? '' : '1'/);
  assert.match(server, /role = 'manager',[\s\S]*is_active = 1/);
});

test('iOS GitHub workflow builds safely and keeps Apple credentials out of source', async () => {
  const [workflowText, gitignoreText] = await Promise.all([
    readFile(new URL('../.github/workflows/ios-testflight.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
  ]);
  const jobEnvironment = workflowText.slice(
    workflowText.indexOf('    env:'),
    workflowText.indexOf('    steps:'),
  );

  assert.match(workflowText, /runs-on: macos-26/);
  assert.match(workflowText, /run: npm run native:ios/);
  assert.match(workflowText, /bundle-id: sa\.nukhab\.app/);
  assert.match(workflowText, /apple-actions\/import-codesign-certs@[a-f0-9]{40} # v7/);
  assert.match(workflowText, /xcrun altool[\s\S]*--upload-app[\s\S]*--apiKey[\s\S]*--apiIssuer/);
  assert.match(workflowText, /\.appstoreconnect\/private_keys\/AuthKey_\$\{APPSTORE_API_KEY_ID\}\.p8/);
  assert.doesNotMatch(jobEnvironment, /APPSTORE_API_PRIVATE_KEY|APPSTORE_CERTIFICATES/);
  assert.match(gitignoreText, /^\*\.p8$/m);
  assert.match(gitignoreText, /^\*\.p12$/m);
  assert.match(gitignoreText, /^\*\.mobileprovision$/m);
});

test('inbox tests import the production handler without executing source text', async () => {
  const [testSource, routes] = await Promise.all([
    readFile(new URL('./sessionInbox.test.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/notificationRoutes.js', import.meta.url), 'utf8'),
  ]);
  assert.match(testSource, /import \{ createNotificationReadHandler \} from '\.\.\/server\/routes\/notificationReadHandler\.js'/);
  assert.doesNotMatch(testSource, /node:vm|\beval\s*\(|\bFunction\s*\(/);
  assert.match(routes, /notificationRouter\.post\('\/read', createNotificationReadHandler\(db\)\)/);
});

test('external GitHub Actions are pinned to full commit SHAs', async () => {
  const workflowsDirectory = new URL('../.github/workflows/', import.meta.url);
  const files = (await readdir(workflowsDirectory)).filter((file) => /\.ya?ml$/.test(file));
  let checked = 0;
  for (const file of files) {
    const workflow = await readFile(new URL(file, workflowsDirectory), 'utf8');
    for (const [, action] of workflow.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gm)) {
      if (action.startsWith('./')) continue;
      assert.match(action, /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/, `${file}: ${action} must use a full commit SHA`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, 'Expected external actions to be checked');
});

test('both iOS releases use a push-capable profile for archive and export', async () => {
  for (const workflow of ['ios-testflight.yml']) {
    const text = await readFile(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8');
    const preparation = text.indexOf('scripts/prepare-ios-push-profile.py');
    const archive = text.indexOf('- name: Archive signed');
    assert.ok(preparation > 0 && preparation < archive);
    assert.match(text, /PROVISIONING_PROFILE_SPECIFIER="\$APP_PUSH_PROVISIONING_PROFILE"/);
    assert.match(text, /<string>\$\{APP_PUSH_PROVISIONING_PROFILE\}<\/string>/);
    const delivery = text.indexOf('xcrun altool');
    const backup = text.indexOf('- name: Store signed IPA artifact');
    assert.ok(delivery > archive && backup > delivery);
    assert.match(text.slice(backup), /continue-on-error: true/);
  }
  const entitlement = await readFile(new URL('../ios/App/App/App.entitlements', import.meta.url), 'utf8');
  assert.match(entitlement, /<key>aps-environment<\/key>/);
});

test('App Store build number is passed through environment variables, never shell source', async () => {
  const workflow = await readFile(new URL('../.github/workflows/ios-app-store-release.yml', import.meta.url), 'utf8');
  const buildInputLines = workflow.split(/\r?\n/).filter((line) => line.includes('inputs.build_number'));

  assert.equal(buildInputLines.length, 2);
  for (const line of buildInputLines) {
    assert.match(line, /^ {10}(?:TARGET_BUILD_NUMBER|BUILD_NUMBER): \$\{\{ inputs\.build_number \}\}$/);
  }
  const submission = workflow.slice(workflow.indexOf('      - name: Select processed build and submit for review'));
  assert.match(submission, /env:\r?\n {10}BUILD_NUMBER: \$\{\{ inputs\.build_number \}\}\r?\n {8}run:/);
  assert.doesNotMatch(submission.slice(submission.indexOf('        run:')), /\$\{\{\s*inputs\./);
  assert.match(submission, /build_number\(ENV\.fetch\("BUILD_NUMBER"\)\)/);
});

test('App Store release replaces older draft and waiting-for-review builds before submission', async () => {
  const [workflowText, inspectorText, brandingText] = await Promise.all([
    readFile(new URL('../.github/workflows/ios-app-store-release.yml', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/inspect-app-store-version.py', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/update-app-store-branding.py', import.meta.url), 'utf8'),
  ]);

  assert.match(workflowText, /REPLACE_READY_FOR_REVIEW_BUILD: "true"/);
  assert.match(workflowText, /REOPEN_FOR_METADATA: "true"/);
  assert.match(workflowText, /APP_RELEASE_NOTES_AR: "[^"]+"/);
  assert.match(workflowText, /APP_RELEASE_NOTES_EN: "[^"]+"/);
  assert.doesNotMatch(workflowText, /Update App Store product name\s+continue-on-error: true/);
  assert.match(workflowText, /APP_COPYRIGHT=2026 نخب/);
  assert.match(brandingText, /"copyright": copyright_text/);
  assert.match(workflowText, /APP_DESCRIPTION_AR=نخب/);
  assert.doesNotMatch(workflowText, /APP_DESCRIPTION_AR=رواسي/);
  assert.match(workflowText, /TARGET_BUILD_NUMBER: \$\{\{ inputs\.build_number \}\}/);
  assert.match(inspectorText, /reopen_for_metadata = os\.environ\.get\("REOPEN_FOR_METADATA"\) == "true"/);
  assert.match(inspectorText, /target_build_number and not reopen_for_metadata/);
  assert.match(inspectorText, /appStoreState.*READY_FOR_REVIEW/s);
  assert.match(inspectorText, /reviewSubmissionItems\/\{item\['id'\]\}/);
  assert.match(inspectorText, /method="DELETE"/);
  assert.match(inspectorText, /WAITING_FOR_REVIEW.*IN_REVIEW/s);
  assert.match(inspectorText, /reviewSubmissions\/\{submission_id\}/);
  assert.match(inspectorText, /method="PATCH"/);
  assert.match(inspectorText, /"attributes": \{"canceled": True\}/);
  assert.match(inspectorText, /cancellable_submission_states/);
  assert.match(inspectorText, /submission_state not in cancellable_submission_states/);
  assert.match(inspectorText, /PREPARE_FOR_SUBMISSION/);
  assert.match(inspectorText, /DEVELOPER_REJECTED/);
  assert.match(inspectorText, /rename_existing_version = True/);
  assert.match(inspectorText, /"attributes": \{"versionString": version_string\}/);
  assert.match(inspectorText, /appStoreVersionLocalizations/);
  assert.match(inspectorText, /"attributes": \{"whatsNew": desired\}/);
  assert.match(inspectorText, /ensure_release_notes\(app_id, version_id, token(?:, retry_state_transition=True)?\)/);
  assert.match(inspectorText, /retry_state_transition=True/);
  assert.match(inspectorText, /"HTTP 409" in str\(error\)/);
  assert.match(inspectorText, /"whatsNew" in str\(error\)/);
  assert.match(inspectorText, /current_state == "DEVELOPER_REJECTED"/);
  assert.match(inspectorText, /continuing with the existing notes/);
  assert.match(brandingText, /appStoreVersionLocalizations/);
  assert.match(brandingText, /"attributes": \{"description": desired\}/);
});

test('iOS privacy strings cover attendance location access required by App Store validation', async () => {
  const infoPlist = await readFile(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');

  assert.match(infoPlist, /<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.match(infoPlist, /<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
});

test('loading surfaces share one indicator and startup does not wait for every font weight', async () => {
  const [
    loadingSpinnerText,
    loadingIndicatorText,
    loadingScreenText,
    dashboardLoaderText,
    buttonText,
    studentsApiText,
    loginText,
    portalText,
    appText,
    heroText,
    publicHeaderText,
    sidebarText,
    mainText,
    brandPreloaderText,
    serviceWorkerText,
    indexCssText,
    indexHtmlText,
  ] = await Promise.all([
    readFile(new URL('../src/components/ui/loading-spinner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/loading-indicator.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/LoadingScreen.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardLoader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/LoginGateway.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/AccountPortal.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicHeroSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/PublicHeader.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/DashboardSidebarContent.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/preloadBrandAssets.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/sw.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
  ]);

  const sourceRoot = new URL('../src/', import.meta.url);
  const sourceFiles = (await readdir(sourceRoot, { recursive: true }))
    .filter((file) => /\.(?:js|jsx)$/.test(file));
  const sourceText = (await Promise.all(sourceFiles.map((file) => (
    readFile(new URL(file.replaceAll('\\', '/'), sourceRoot), 'utf8')
  )))).join('\n');

  assert.match(loadingSpinnerText, /loading-logo/);
  assert.match(loadingIndicatorText, /<LoadingSpinner size=/);
  assert.match(loadingIndicatorText, /data-loading-indicator=/);
  assert.match(loadingIndicatorText, /aria-label="جاري التحميل"/);
  assert.doesNotMatch(loadingIndicatorText, />\s*جاري التحميل\s*</);
  assert.match(loadingScreenText, /LoadingIndicator mode="screen" delayMs=\{0\}/);
  assert.match(loadingScreenText, /تعذر إكمال التحميل/);
  assert.match(dashboardLoaderText, /<LoadingIndicator className=/);
  assert.match(buttonText, /<LoadingSpinner className="ml-2"/);
  assert.doesNotMatch(studentsApiText, /updateRequestLoading|REQUEST_LOADING_EVENT/);
  assert.doesNotMatch(loginText, /RequestLoadingIndicator/);
  assert.doesNotMatch(portalText, /RequestLoadingIndicator/);
  assert.doesNotMatch(appText, /const LoginGateway = lazy/);
  assert.match(appText, /import LoginGateway from '@\/pages\/LoginGateway'/);
  assert.match(appText, /const AccountPortal = lazy\(\(\) => import\('@\/pages\/AccountPortal'\)\)/);
  assert.match(appText, /const WajehDashboard = lazy\(\(\) => import\('@\/pages\/WajehDashboard'\)\)/);
  assert.doesNotMatch(heroText, /<motion\.img/);
  assert.match(heroText, /<img[\s\S]+?decoding="sync"[\s\S]+?fetchpriority="high"/);
  assert.match(publicHeaderText, /decoding="sync"[\s\S]+?fetchpriority="high"/);
  assert.match(sidebarText, /decoding="sync"[\s\S]+?fetchpriority="high"/);
  assert.doesNotMatch(sourceText, /\bLoader2\b/);
  assert.doesNotMatch(mainText, /waitForUiFont|UI_FONT_TIMEOUT_MS/);
  assert.match(mainText, /mountApp\(\);\s*scheduleServiceWorkerSetup\(\);/);
  assert.match(mainText, /requestIdleCallback\(runServiceWorkerSetup/);
  assert.doesNotMatch(mainText, /hardBootTimeout|loadPublicSettingsCached|preloadSiteBrandAssets/);
  assert.match(mainText, /document\.getElementById\('app-root'\)/);
  assert.match(mainText, /new MutationObserver\(revealWhenScreenIsReady\)/);
  assert.match(mainText, /querySelector\('\[data-loading-indicator="screen"\]'\)/);
  assert.match(brandPreloaderText, /image\.fetchPriority = 'high'/);
  assert.match(serviceWorkerText, /isCacheFirstAsset/);
  assert.match(serviceWorkerText, /branding\/\$\{BRAND\.directory\}\//);
  assert.equal((indexCssText.match(/font-display: swap/g) || []).length, 2);
  assert.equal((indexHtmlText.match(/rel="preload" href="%BASE_URL%fonts\/cairo\//g) || []).length, 1);
  assert.match(indexHtmlText, /<div id="app-root"><\/div>/);
  assert.doesNotMatch(indexHtmlText, /boot-loader__text|>جاري التحميل</);
});

test('toast errors render above dialog portals on every page', async () => {
  const [toasterText, toastText, dialogText] = await Promise.all([
    readFile(new URL('../src/components/ui/toaster.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/toast.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/dialog.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(toasterText, /createPortal\(<ToastViewport \/>, document\.body\)/);
  assert.match(toastText, /z-\[300\]/);
  assert.match(dialogText, /z-50/);
});
