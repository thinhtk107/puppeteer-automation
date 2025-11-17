const { spawn } = require('child_process');
const path = require('path');
const Jimp = require('jimp');

async function jsMatchTemplate(pagePath, templatePath) {
  // simple brute-force template matching (RGB SAD) - not optimized but works as a fallback
  const img = await Jimp.read(pagePath);
  const tpl = await Jimp.read(templatePath);
  const W = img.bitmap.width - tpl.bitmap.width + 1;
  const H = img.bitmap.height - tpl.bitmap.height + 1;
  if (W <= 0 || H <= 0) return null;

  let best = { x: 0, y: 0, score: Number.POSITIVE_INFINITY };
  for (let y = 0; y < H; y += 4) { // step for speed
    for (let x = 0; x < W; x += 4) {
      let sad = 0;
      for (let ty = 0; ty < tpl.bitmap.height; ty += 4) {
        for (let tx = 0; tx < tpl.bitmap.width; tx += 4) {
          const p1 = img.getPixelColor(x + tx, y + ty);
          const p2 = tpl.getPixelColor(tx, ty);
          const c1 = Jimp.intToRGBA(p1);
          const c2 = Jimp.intToRGBA(p2);
          sad += Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b);
          if (sad > best.score) break;
        }
        if (sad > best.score) break;
      }
      if (sad < best.score) best = { x, y, score: sad };
    }
  }
  // threshold heuristic
  const norm = best.score / (tpl.bitmap.width * tpl.bitmap.height);
  if (norm < 50) return { x: best.x + Math.floor(tpl.bitmap.width / 2), y: best.y + Math.floor(tpl.bitmap.height / 2) };
  return null;
}

function matchTemplate(pagePath, templatePath) {
  return new Promise((resolve, reject) => {
    // If a bundled native exe exists (produced by PyInstaller), prefer it
  const bundledExe = path.join(__dirname, '..', '..', 'tools', process.platform === 'win32' ? 'image_match.exe' : 'image_match');
  // when packaged with pkg, the executable may be next to process.execPath
  const execDirBundled = path.join(path.dirname(process.execPath), process.platform === 'win32' ? 'image_match.exe' : 'image_match');
    const py = path.join(__dirname, '..', '..', 'tools', 'image_match.py');
    const candidates = ['python', 'py', 'python3'];
    let spawned = false;
    let proc = null;
    try {
      const fs = require('fs');
      if (fs.existsSync(bundledExe)) {
        // run the bundled native executable directly (project tree)
        proc = spawn(bundledExe, [pagePath, templatePath]);
        spawned = true;
      } else if (fs.existsSync(execDirBundled)) {
        // run the bundled native executable next to packaged exe
        proc = spawn(execDirBundled, [pagePath, templatePath]);
        spawned = true;
      }
    } catch (e) {
      spawned = false;
    }
    if (!spawned) {
      for (const c of candidates) {
        try {
          proc = spawn(c, [py, pagePath, templatePath]);
          spawned = true;
          break;
        } catch (e) {
          spawned = false;
        }
      }
    }
    if (!spawned) {
      // fallback to JS matcher
      jsMatchTemplate(pagePath, templatePath).then(r => resolve(r)).catch(err => reject(err));
      return;
    }
    let out = '';
    let err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('close', code => {
      if (code !== 0) {
        // fall back to JS matcher if Python script failed
        jsMatchTemplate(pagePath, templatePath).then(r => resolve(r)).catch(e => reject(new Error('Matcher failed: ' + err + ' | ' + e.message)));
        return;
      }
      const parts = out.trim().split(' ');
      if (parts[0] === 'FOUND') {
        const x = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        resolve({ x, y });
      } else {
        resolve(null);
      }
    });
  });
}

module.exports = { matchTemplate };
