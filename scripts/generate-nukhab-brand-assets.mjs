import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const background = '#F7FAF6';
const appLogo = await readFile(path.join(root, 'public/branding/nukhab/nukhab-app.png'), 'base64');
const colorLogo = await readFile(path.join(root, 'public/branding/nukhab/nukhab-color.png'), 'base64');
const appLogoUrl = `data:image/png;base64,${appLogo}`;
const colorLogoUrl = `data:image/png;base64,${colorLogo}`;
const browser = await chromium.launch({ headless: true });

const writeGeneratedImage = async (output, content) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await writeFile(output, content);
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await wait(100 * (attempt + 1));
    }
  }
};

const render = async ({ destination, width, height, logoScale = 0.78, transparent = false, logoUrl = colorLogoUrl }) => {
  const output = path.join(root, destination);
  await mkdir(path.dirname(output), { recursive: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const logoSize = Math.round(Math.min(width, height) * logoScale);
  await page.setContent(`
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        display: grid;
        place-items: center;
        background: ${transparent ? 'transparent' : background};
      }
      img { width: ${logoSize}px; height: ${logoSize}px; object-fit: contain; }
    </style>
    ${logoScale ? `<img alt="" src="${logoUrl}">` : ''}
  `);
  if (logoScale) await page.locator('img').evaluate((image) => image.decode());
  const screenshot = await page.screenshot({ omitBackground: transparent });
  await writeGeneratedImage(output, screenshot);
  await page.close();
};

try {
  await render({ destination: 'public/branding/nukhab/icon-192.png', width: 192, height: 192, logoScale: 1, logoUrl: appLogoUrl });
  await render({ destination: 'public/branding/nukhab/icon-512.png', width: 512, height: 512, logoScale: 1, logoUrl: appLogoUrl });
  await render({
    destination: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    width: 1024,
    height: 1024,
    logoScale: 1,
    logoUrl: appLogoUrl,
  });

  const androidDensities = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(androidDensities)) {
    const directory = `android/app/src/main/res/mipmap-${density}`;
    await render({ destination: `${directory}/ic_launcher.png`, width: size, height: size, logoScale: 1, logoUrl: appLogoUrl });
    await copyFile(path.join(root, `${directory}/ic_launcher.png`), path.join(root, `${directory}/ic_launcher_round.png`));
    await render({
      destination: `${directory}/ic_launcher_foreground.png`,
      width: Math.round(size * 2.25),
      height: Math.round(size * 2.25),
      logoScale: 0.59,
      transparent: true,
      logoUrl: colorLogoUrl,
    });
    await render({
      destination: `${directory}/ic_launcher_background.png`,
      width: size,
      height: size,
      logoScale: 0,
    });
  }

  const androidSplashDirectory = path.join(root, 'android/app/src/main/res');
  const androidSplashFiles = [
    ['drawable/splash.png', 320, 480],
    ['drawable-land-hdpi/splash.png', 800, 480],
    ['drawable-land-ldpi/splash.png', 320, 240],
    ['drawable-land-mdpi/splash.png', 480, 320],
    ['drawable-land-night-hdpi/splash.png', 800, 480],
    ['drawable-land-night-ldpi/splash.png', 320, 240],
    ['drawable-land-night-mdpi/splash.png', 480, 320],
    ['drawable-land-night-xhdpi/splash.png', 1280, 720],
    ['drawable-land-night-xxhdpi/splash.png', 1600, 960],
    ['drawable-land-night-xxxhdpi/splash.png', 1920, 1280],
    ['drawable-land-xhdpi/splash.png', 1280, 720],
    ['drawable-land-xxhdpi/splash.png', 1600, 960],
    ['drawable-land-xxxhdpi/splash.png', 1920, 1280],
    ['drawable-night/splash.png', 320, 240],
    ['drawable-port-hdpi/splash.png', 480, 800],
    ['drawable-port-ldpi/splash.png', 240, 320],
    ['drawable-port-mdpi/splash.png', 320, 480],
    ['drawable-port-night-hdpi/splash.png', 480, 800],
    ['drawable-port-night-ldpi/splash.png', 240, 320],
    ['drawable-port-night-mdpi/splash.png', 320, 480],
    ['drawable-port-night-xhdpi/splash.png', 720, 1280],
    ['drawable-port-night-xxhdpi/splash.png', 960, 1600],
    ['drawable-port-night-xxxhdpi/splash.png', 1280, 1920],
    ['drawable-port-xhdpi/splash.png', 720, 1280],
    ['drawable-port-xxhdpi/splash.png', 960, 1600],
    ['drawable-port-xxxhdpi/splash.png', 1280, 1920],
  ];
  for (const [relativePath, width, height] of androidSplashFiles) {
    await render({
      destination: path.relative(root, path.join(androidSplashDirectory, relativePath)),
      width,
      height,
      logoScale: 0.33,
      logoUrl: appLogoUrl,
    });
  }

  const iosSplashDirectory = 'ios/App/App/Assets.xcassets/Splash.imageset';
  const iosSplashNames = [
    'Default@1x~universal~anyany-dark.png',
    'Default@1x~universal~anyany.png',
    'Default@2x~universal~anyany-dark.png',
    'Default@2x~universal~anyany.png',
    'Default@3x~universal~anyany-dark.png',
    'Default@3x~universal~anyany.png',
  ];
  await render({
    destination: `${iosSplashDirectory}/${iosSplashNames[0]}`,
    width: 2732,
    height: 2732,
    logoScale: 0.33,
    logoUrl: appLogoUrl,
  });
  for (const name of iosSplashNames.slice(1)) {
    await copyFile(path.join(root, `${iosSplashDirectory}/${iosSplashNames[0]}`), path.join(root, `${iosSplashDirectory}/${name}`));
  }
} finally {
  await browser.close();
}
