// Перерисовывает PNG-иконки Android из SVG. Нужен Playwright: npm i -D playwright && node apps/android/scripts/render-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url);
const legacy = readFileSync(new URL('../web/public/icon.svg', root), 'utf8');
const foreground = readFileSync(new URL('icon/foreground.svg', root), 'utf8');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const page = await browser.newPage();
async function render(svg, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.screenshot({ path: new URL(out, root).pathname, omitBackground: true });
}
for (const [name, scale] of Object.entries(densities)) {
  await render(legacy, 48 * scale, `res/mipmap-${name}/ic_launcher.png`);
  await render(foreground, 108 * scale, `res/mipmap-${name}/ic_launcher_foreground.png`);
}
await browser.close();
