import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('store action uses the shared button theme in light and dark modes', async () => {
  const store = await readFile(new URL('../src/components/dashboard/StoreSection.jsx', import.meta.url), 'utf8');
  const addButton = store.match(/<Button[^>]+onClick=\{\(\) => openProduct\(\)\}[\s\S]*?إضافة منتج[\s\S]*?<\/Button>/)?.[0] || '';
  assert.match(addButton, /className="h-11 gap-2 px-5"/);
  assert.doesNotMatch(addButton, /bg-white|text-white|text-\[#06332f\]/);
});

test('best committee cards show the full name and allow a wider card', async () => {
  const ranking = await readFile(new URL('../src/components/public/FamilyRankingMarquee.jsx', import.meta.url), 'utf8');
  assert.match(ranking, /w-\[min\(90vw,28rem\)\]/);
  assert.match(ranking, /whitespace-normal break-words[^>]+>\{item\.name\}/);
  assert.doesNotMatch(ranking, /truncate[^>]+>\{item\.name\}/);
});

test('optimized colored and white logos keep transparent WebP variants for responsive delivery', async () => {
  const [colored, white, coloredSmall, whiteSmall] = await Promise.all([
    readFile(new URL('../public/branding/nukhab/nukhab-color-640.webp', import.meta.url)),
    readFile(new URL('../public/branding/nukhab/nukhab-white-640.webp', import.meta.url)),
    readFile(new URL('../public/branding/nukhab/nukhab-color-320.webp', import.meta.url)),
    readFile(new URL('../public/branding/nukhab/nukhab-white-320.webp', import.meta.url)),
  ]);
  for (const image of [colored, white, coloredSmall, whiteSmall]) {
    assert.equal(image.subarray(0, 4).toString(), 'RIFF');
    assert.equal(image.subarray(8, 12).toString(), 'WEBP');
  }
  assert.ok(colored.length < 200_000);
  assert.ok(white.length < 250_000);
});

test('homepage branding keeps Nukhab lockup', async () => {
  const [config, hero, header] = await Promise.all([
    readFile(new URL('../src/site/siteConfigs.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/public/nukhab/NukhabPublicHeader.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(config, /organizationName: 'نخب'/);
  assert.match(hero, /srcSet=\{site\.logoSmall/);
  assert.match(hero, /sizes="min\(72vw, 320px\)"/);
  assert.match(hero, /site\.organizationName/);
  assert.match(hero, /font-black/);
  assert.match(header, /site\.publicHeaderTitle \|\| site\.name/);
  assert.match(header, /site\.publicHeaderSubtitle \?\? site\.organizationName/);
});

test('the Nukhab logo ships as SVG for the browser tab and PNG for the app', async () => {
  const [svg, whiteSvg, manifest] = await Promise.all([
    readFile(new URL('../public/branding/nukhab/nukhab-logo.svg', import.meta.url), 'utf8'),
    readFile(new URL('../public/branding/nukhab/nukhab-logo-white.svg', import.meta.url), 'utf8'),
    readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
  ]);
  for (const source of [svg, whiteSvg]) {
    assert.match(source, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="/);
    assert.match(source, /fill="#dfa33b"/);
  }
  assert.match(svg, /fill="#046e65"/);
  assert.match(whiteSvg, /fill="#ffffff"/);
  const icons = JSON.parse(manifest).icons.map((icon) => icon.src);
  assert.deepEqual(icons, ['branding/nukhab/nukhab-logo.svg?v=29', 'branding/nukhab/icon-192.png?v=29', 'branding/nukhab/icon-512.png?v=29']);
});
