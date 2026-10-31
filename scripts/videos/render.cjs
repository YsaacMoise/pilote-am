// node render.cjs <film> stills t1,t2,...   |   node render.cjs <film> video out.mp4
const { chromium } = require('/opt/node-tools/node_modules/playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const [film, mode, arg] = process.argv.slice(2);
const dur = JSON.parse(fs.readFileSync(__dirname + '/durees.json'));
const P = { quotidien: 'q', iphone: 'i', android: 'a' }[film];
const voix = {}; for (const k in dur) if (k[0] === P) voix[k] = dur[k];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const p = await (await b.newContext({ viewport: { width: 1080, height: 1920 } })).newPage();
  await p.goto('http://127.0.0.1:8765/engine.html');
  await p.evaluate(() => window.ARVELA.load());
  const info = await p.evaluate(([f, v]) => window.ARVELA.setup(f, v), [film, voix]);
  fs.writeFileSync(`${__dirname}/timeline-${film}.json`, JSON.stringify(info, null, 1));
  console.log(film, 'durée', info.total.toFixed(2), 's');
  if (mode === 'stills') {
    for (const t of arg.split(',').map(Number)) {
      const b64 = await p.evaluate((t) => window.ARVELA.frame(t), t);
      fs.writeFileSync(`${__dirname}/still-${film}-${t}.jpg`, Buffer.from(b64, 'base64'));
    }
  } else {
    const fps = 30, n = Math.round(info.total * fps);
    const tmp = arg.replace(/\.mp4$/, '.tmp.mp4');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = 0; i < n; i++) {
      const b64 = await p.evaluate((t) => window.ARVELA.frame(t), i / fps);
      if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    const code = await new Promise((r) => ff.on('close', r));
    if (code === 0) fs.renameSync(tmp, arg); else throw new Error('ffmpeg ' + code);
    console.log('écrit', arg, n, 'images');
  }
  await b.close();
})();
