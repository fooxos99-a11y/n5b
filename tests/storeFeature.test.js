import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('store purchase keeps wallet and ranking deductions separate', async () => {
  const source = await readFile(new URL('../server/routes/storeRoutes.js', import.meta.url), 'utf8');

  assert.match(source, /store_balance = store_balance - \?/);
  assert.match(source, /if \(settings\.storePurchaseDeductsRanking\)/);
  assert.match(source, /updateStoreBalance: false/);
  assert.match(source, /FOR UPDATE/);
  assert.match(source, /UPDATE store_products SET stock = stock - 1/);
});

test('store activation and ranking deduction are managed from the store page with store permission', async () => {
  const [managerStore, settings, routes, api, dashboard] = await Promise.all([
    readFile(new URL('../src/components/dashboard/StoreSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/storeRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/WajehDashboard.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(await readFile(new URL('../src/components/store/StoreSettingsActions.jsx', import.meta.url), 'utf8'), /label="تفعيل المتجر"/);
  assert.match(managerStore, /خصم النقاط من الترتيب عند الشراء من المتجر/);
  assert.match(managerStore, /<DashboardMobileHeaderActions>[\s\S]*<StoreSettingsActions/);
  assert.doesNotMatch(managerStore, /const configurationPanel = \(\s*<Card>/);
  assert.doesNotMatch(settings, /category="settingsStore"/);
  assert.match(routes, /router\.get\('\/configuration', requireStoreManagement/);
  assert.match(routes, /router\.patch\('\/configuration', requireStoreManagement/);
  assert.match(api, /getStoreConfiguration/);
  assert.match(api, /updateStoreConfiguration/);
  assert.doesNotMatch(dashboard, /section\.key === 'store' && \(!settings\.pointsSystemEnabled \|\| !settings\.storeEnabled\)/);
});

test('student store has no orders or ranking position and settings have no recitation points', async () => {
  const [studentStore, settings] = await Promise.all([
    readFile(new URL('../src/components/portal/StudentStoreSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/dashboard/SettingsSection.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(studentStore, /طلباتي|ترتيبك/);
  for (const key of ['memorizationPoints', 'reviewPoints', 'linkPoints']) assert.doesNotMatch(settings, new RegExp(`key: '${key}'`));
});

test('store uses exciting shared product cards, ten-megabyte images, stock visibility, and a gold coin UI', async () => {
  const [managerStore, studentStore, productCard, productImage, pointsValue, coinIcon, routes, api, migration] = await Promise.all([
    readFile(new URL('../src/components/dashboard/StoreSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentStoreSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/store/StoreProductCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/store/StoreProductImage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/points/PointsValue.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/points/CoinIcon.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/routes/storeRoutes.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/studentsApi.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/migrations/2026.09.02.2-store-product-archive.js', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(managerStore, /store-product-description|product\.description/);
  assert.doesNotMatch(studentStore, /product\.description| نقطة/);
  assert.match(managerStore, /<ManagementList label="المنتجات">/);
  assert.match(studentStore, /StoreProductCard/);
  assert.match(studentStore, /رصيد المتجر/);
  assert.doesNotMatch(managerStore, /setOrders\(\[\]\)/);
  assert.match(productCard, /StoreProductImage/);
  assert.match(productCard, /rounded-3xl/);
  assert.match(productCard, /hover:-translate-y-1/);
  assert.match(productCard, /المتبقي/);
  assert.match(productImage, /aspect-square/);
  assert.match(productImage, /h-full w-full[^"']*object-contain/);
  assert.doesNotMatch(productImage, /object-cover|scale-/);
  assert.match(pointsValue, /text-\[#a66a10\]/);
  assert.match(coinIcon, /viewBox="0 0 512 512"/);
  assert.match(coinIcon, /h-5 w-5/);
  assert.match(coinIcon, /primary-foreground/);
  assert.doesNotMatch(coinIcon, /M9\.2 12h5\.6/);
  assert.match(managerStore, /10 \* 1024 \* 1024/);
  assert.match(routes, /MAX_IMAGE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(managerStore, /product\.isActive \? 'إخفاء' : 'إظهار'/);
  assert.match(managerStore, /<ManagementTabs[\s\S]*label: 'المنتجات'[\s\S]*label: 'طلبات الطلاب'/);
  assert.doesNotMatch(managerStore, /bg-\[#dfa33b\]/);
  assert.match(api, /setStoreProductActive/);
  assert.match(api, /deleteStoreOrder/);
  assert.match(api, /removeStoreProduct/);
  assert.match(managerStore, /حذف المنتج/);
  assert.match(routes, /deleted_at IS NULL/);
  assert.match(routes, /deleted_at = NOW\(\)/);
  assert.match(migration, /ADD COLUMN deleted_at TIMESTAMP NULL/);
  assert.match(studentStore, /أُرسل الطلب للمراجعة/);
  assert.match(studentStore, /duration: 3000/);
});
