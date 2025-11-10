const path = require('path');
const fs = require('fs');
const { matchTemplate } = require('./template_matcher');
const { takeFullPageScreenshot } = require('./screenshot_helper');

async function findTemplateOnScreenshot(page, screenshotPath, templatePath) {
  return await matchTemplate(screenshotPath, templatePath);
}

async function clickImage(page, templatesMap, templatesDir, templateName, logger) {
  const screenshotPath = path.join(templatesDir, 'page.png');
  await takeFullPageScreenshot(page, screenshotPath);
  let templatePath = templatesMap[templateName];
  if (!templatePath) {
    const fallback = path.join(__dirname, '..', 'resources', templateName);
    if (fs.existsSync(fallback)) templatePath = fallback;
  }
  if (!templatePath) {
    logger && logger.warn && logger.warn('Template not found in uploaded or resources: ' + templateName);
    return null;
  }
  logger && logger.log && logger.log('clickImage -> matching template: ' + templatePath);
  const coords = await findTemplateOnScreenshot(page, screenshotPath, templatePath);
  if (!coords) return null;
  const { clickAbsolute } = require('./click_helper');
  await clickAbsolute(page, coords.x, coords.y, logger);
  return coords;
}

const cfg = require('./config');

async function waitForTemplate(page, templatesMap, templatesDir, templateName, timeoutMs = cfg.DEFAULT_TEMPLATE_TIMEOUT_MS, intervalMs = cfg.TEMPLATE_INTERVAL_MS, logger) {
  const deadline = Date.now() + timeoutMs;
  const screenshotPath = path.join(templatesDir, 'page.png');
  logger && logger.log && logger.log(`waitForTemplate -> waiting for ${templateName} timeout=${timeoutMs}`);
  while (Date.now() < deadline) {
    try { await require('./screenshot_helper').waitForCanvasAndStabilize(page, Math.min(cfg.CANVAS_STABILIZE_MS, timeoutMs)); } catch(e){}
    await takeFullPageScreenshot(page, screenshotPath);
    let templatePath = templatesMap[templateName];
    if (!templatePath) {
      const fallback = path.join(__dirname, '..', 'resources', templateName);
      if (fs.existsSync(fallback)) templatePath = fallback;
    }
    if (!templatePath) {
      logger && logger.warn && logger.warn('waitForTemplate -> template not found in map or resources: ' + templateName);
      return null;
    }
    logger && logger.log && logger.log('waitForTemplate -> trying match with ' + templatePath);
    const coords = await findTemplateOnScreenshot(page, screenshotPath, templatePath);
    if (coords) {
      logger && logger.log && logger.log('waitForTemplate -> found at ' + coords.x + ',' + coords.y);
      return coords;
    }
  await page.waitForTimeout(intervalMs);
  }
  logger && logger.warn && logger.warn('waitForTemplate -> timeout waiting for ' + templateName);
  return null;
}

module.exports = { clickImage, waitForTemplate, findTemplateOnScreenshot };
