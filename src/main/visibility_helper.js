async function ensureVisible(page, absX, absY) {
  const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
  const cssX = absX / dpr;
  const cssY = absY / dpr;
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, innerHeight: window.innerHeight }));
  if (cssY < scroll.y || cssY > (scroll.y + scroll.innerHeight)) {
    const targetY = Math.max(0, Math.round(cssY - Math.floor(scroll.innerHeight / 2)));
    await page.evaluate((y) => window.scrollTo({ top: y, left: 0, behavior: 'auto' }), targetY);
    await page.waitForTimeout(300);
  }
}

module.exports = { ensureVisible };
