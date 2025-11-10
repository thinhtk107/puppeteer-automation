const cfg = require('./config');

async function clickAbsolute(page, absX, absY, logger) {
  logger && logger.log && logger.log(`clickAbsolute -> received screenshot-px ${absX},${absY}`);
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  const cssX = absX / dpr;
  const cssY = absY / dpr;
  const { ensureVisible } = require('./visibility_helper');
  await ensureVisible(page, absX, absY);
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  const viewportX = Math.round(cssX - scroll.x);
  const viewportY = Math.round(cssY - scroll.y);
  logger && logger.log && logger.log(`clickAbsolute -> DPR=${dpr} css=${cssX.toFixed(1)},${cssY.toFixed(1)} viewport=${viewportX},${viewportY}`);
  const vp = page.viewport() || { width: 1280, height: 800 };
  const safeX = Math.max(0, Math.min(viewportX, vp.width - 1));
  const safeY = Math.max(0, Math.min(viewportY, vp.height - 1));
  await page.mouse.move(safeX, safeY, { steps: cfg.CLICK_STEPS });
  await page.mouse.down();
  await page.mouse.up();
}

module.exports = { clickAbsolute };
