// T-112 : garde du robot des parcours. Chargé avant chaque parcours (node --require ./scripts/e2e-garde.cjs …).
// Toute requête du navigateur vers une adresse qui n'est pas sur cette machine (PostHog, vrai projet Firebase,
// n'importe quel site) est bloquée avant de partir, écrite dans le journal, et le parcours finit en échec.
// Seules passent : localhost, 127.0.0.1, ::1 (site servi en local, faux service, émulateurs), data:, blob:, about:.
const pw = require('playwright');

const bloquees = [];
const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function locale(u) {
  if (!/^(https?|wss?):$/.test(u.protocol)) return true;
  return LOCALES.has(u.hostname);
}

async function garder(ctx) {
  if (ctx.__gardeT112) return;
  ctx.__gardeT112 = true;
  await ctx.route((u) => !locale(u), (route) => {
    const url = route.request().url();
    bloquees.push(url);
    console.error('  GARDE T-112 : requête sortante bloquée : ' + url);
    return route.abort('blockedbyclient');
  });
}

for (const type of [pw.chromium]) {
  const launch = type.launch.bind(type);
  type.launch = async (...args) => {
    const b = await launch(...args);
    const newContext = b.newContext.bind(b);
    b.newContext = async (...o) => { const c = await newContext(...o); await garder(c); return c; };
    const newPage = b.newPage.bind(b);
    b.newPage = async (...o) => { const p = await newPage(...o); await garder(p.context()); return p; };
    return b;
  };
}

process.on('exit', () => {
  if (!bloquees.length) return;
  const hotes = [...new Set(bloquees.map((x) => { try { return new URL(x).host; } catch { return x; } }))];
  console.error(`ÉCHEC GARDE T-112 : ${bloquees.length} requête(s) vers l'extérieur (${hotes.join(', ')}). Aucune ne doit partir pendant les parcours.`);
  process.exitCode = 1;
});
