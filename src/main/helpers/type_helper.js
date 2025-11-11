async function typeIntoImageField(page, templatesMap, templatesDir, templateName, text, logger) {
  const path = require('path');
  const cfg = require('../config/config');
  const screenshotPath = path.join(templatesDir, 'page.png');
  await require('./screenshot_helper').takeFullPageScreenshot(page, screenshotPath);
  let templatePath = templatesMap[templateName];
  if (!templatePath) {
    const fallback = path.join(__dirname, '..', 'resources', templateName);
    if (require('fs').existsSync(fallback)) templatePath = fallback;
  }
  if (!templatePath) {
    logger && logger.warn && logger.warn('Template not found for typing: ' + templateName);
    return null;
  }
  logger && logger.log && logger.log('typeIntoImageField -> looking for template ' + templateName);
  let coords = await require('./matcher_helper').findTemplateOnScreenshot(page, screenshotPath, templatePath);
  if (!coords) coords = await require('./matcher_helper').waitForTemplate(page, templatesMap, templatesDir, templateName, cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, cfg.TEMPLATE_INTERVAL_MS, logger);
  if (!coords) return null;
  const { clickAbsolute } = require('./click_helper');
    // fallback: click at matched coordinate (screenshot/device pixels)
    await clickAbsolute(page, coords.x, coords.y, logger);

  // small pause to allow focus to settle
  await page.waitForTimeout(cfg.SHORT_WAIT_MS);
  try {
    await page.keyboard.type(text || '', { delay: 30 });
  } catch (e) {
    logger && logger.warn && logger.warn('keyboard.type failed, dispatching events to canvas');
    await page.evaluate((t) => {
      const c = document.getElementById('GameCanvas');
      if (!c) return;
      c.focus && c.focus();
      for (const ch of t) {
        const ev = new KeyboardEvent('keydown', { key: ch, bubbles: true });
        c.dispatchEvent(ev);
        const ev2 = new KeyboardEvent('keypress', { key: ch, bubbles: true });
        c.dispatchEvent(ev2);
        const ev3 = new KeyboardEvent('keyup', { key: ch, bubbles: true });
        c.dispatchEvent(ev3);
      }
    }, text || '');
  }
  try {
    await page.evaluate((tx) => {
      const inputs = document.querySelectorAll('input, textarea');
      for (const el of inputs) {
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.height > 10 && (r.top > 0 && r.top < window.innerHeight)) {
          el.focus && el.focus();
          el.value = tx;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          break;
        }
      }
    }, text || '');
  } catch (e) {}
  return coords;
}

module.exports = { typeIntoImageField };
