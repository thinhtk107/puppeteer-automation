const fs = require('fs');
const path = require('path');
const cfg = require('./config');

async function takeFullPageScreenshot(page, destPath) {
  try {
  await waitForCanvasAndStabilize(page, cfg.CANVAS_STABILIZE_MS);
  } catch (e) {
    // ignore and proceed to screenshot
  }
  await page.screenshot({ path: destPath, fullPage: true });
}

async function waitForCanvasAndStabilize(page, timeoutMs = 8000) {
  try {
    await page.waitForSelector('#GameCanvas', { timeout: timeoutMs });
  } catch (e) {
    return false;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const size = await page.evaluate(() => {
      const c = document.getElementById('GameCanvas');
      if (!c) return { w: 0, h: 0 };
      const r = c.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    if (size.w > 0 && size.h > 0) {
      await page.waitForTimeout(cfg.SHORT_WAIT_MS);
      return true;
    }
    await page.waitForTimeout(200);
  }
  return false;
}

module.exports = { takeFullPageScreenshot, waitForCanvasAndStabilize };
