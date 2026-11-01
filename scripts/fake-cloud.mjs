// Faux service en ligne, en mémoire, pour les tests automatisés de la synchronisation.
// Usage : node scripts/fake-cloud.mjs 4180
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 4180);
const users = new Map(); // email -> { uid, password }
const data = new Map(); // uid -> Map(docId -> doc)
const verifies = new Map(); // code du lien de confirmation -> email
const resets = new Map(); // code du lien -> email (comme le lien d'un e-mail de réinitialisation)
let clock = Date.now();

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x');
  let body = {};
  if (req.method === 'POST') {
    let raw = '';
    for await (const c of req) raw += c;
    body = raw ? JSON.parse(raw) : {};
  }
  switch (url.pathname) {
    case '/create': {
      if (users.has(body.email)) return send(res, 400, { code: 'auth/email-already-in-use' });
      const uid = 'u' + Math.random().toString(36).slice(2, 10);
      users.set(body.email, { uid, password: body.password });
      return send(res, 200, { uid });
    }
    case '/signin': {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return send(res, 400, { code: 'auth/invalid-credential' });
      return send(res, 200, { uid: u.uid, verified: !!u.verified });
    }
    case '/send-verify': {
      if (users.has(body.email)) verifies.set('verif-' + Math.random().toString(36).slice(2, 10), body.email);
      return send(res, 200, {});
    }
    case '/last-verify': return send(res, 200, { code: [...verifies].filter(([, e]) => e === url.searchParams.get('email')).pop()?.[0] ?? null });
    case '/apply-code': {
      const email = verifies.get(body.code);
      if (!email) return send(res, 400, { code: 'auth/invalid-action-code' });
      users.get(email).verified = true;
      verifies.delete(body.code);
      return send(res, 200, {});
    }
    case '/user': return send(res, 200, { verified: !!users.get(body.email)?.verified });
    case '/reset': {
      if (users.has(body.email)) resets.set('code-' + Math.random().toString(36).slice(2, 10), body.email);
      return send(res, 200, {});
    }
    // Pour les tests : le dernier lien « envoyé » à une adresse
    case '/last-reset': return send(res, 200, { code: [...resets].filter(([, e]) => e === url.searchParams.get('email')).pop()?.[0] ?? null });
    case '/verify-reset': {
      const email = resets.get(body.code);
      return email ? send(res, 200, { email }) : send(res, 400, { code: 'auth/invalid-action-code' });
    }
    case '/confirm-reset': {
      const email = resets.get(body.code);
      if (!email) return send(res, 400, { code: 'auth/invalid-action-code' });
      users.get(email).password = body.password;
      resets.delete(body.code);
      return send(res, 200, {});
    }
    case '/delete': {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return send(res, 400, { code: 'auth/invalid-credential' });
      data.delete(u.uid);
      users.delete(body.email);
      return send(res, 200, {});
    }
    case '/write': {
      const m = data.get(body.uid) ?? new Map();
      data.set(body.uid, m);
      for (const d of body.docs) m.set(`${d.s}~${d.k}`, { ...d, t: ++clock, d: body.d });
      return send(res, 200, {});
    }
    case '/docs': {
      const since = Number(url.searchParams.get('since'));
      const m = data.get(url.searchParams.get('uid')) ?? new Map();
      return send(res, 200, { docs: [...m.values()].filter((d) => d.t > since) });
    }
    case '/reset-all': {
      users.clear();
      data.clear();
      return send(res, 200, {});
    }
    case '/stats': {
      const out = {};
      for (const [uid, m] of data) out[uid] = { total: m.size, live: [...m.values()].filter((d) => d.v !== null).length };
      return send(res, 200, out);
    }
    default: return send(res, 404, {});
  }
}).listen(port, () => console.log(`faux service en ligne sur http://localhost:${port}`));
