// Garde-fous de sécurité (audit C-043 et protection anti-robots) : ces tests échouent si une
// modification affaiblit la règle CSP ou fait tourner App Check ailleurs que sur arvela.fr.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { appCheckActif, RECAPTCHA_SITE_KEY } from '../src/firebase-config';

const conf = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
const entetes: { key: string; value: string }[] = conf.hosting.headers.find((h: any) => h.source === '**').headers;
const csp = entetes.find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const directive = (nom: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(nom + ' ')) ?? '';

describe('règle CSP de firebase.json', () => {
  it('existe et ferme tout par défaut', () => {
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
  });
  it("n'autorise aucun script écrit dans la page ni évalué", () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });
  it('laisse passer reCAPTCHA pour App Check', () => {
    expect(directive('script-src')).toContain('https://www.google.com/recaptcha/');
    expect(directive('script-src')).toContain('https://www.gstatic.com/recaptcha/');
    expect(directive('frame-src')).toContain('https://www.google.com/recaptcha/');
    expect(directive('connect-src')).toContain('https://www.google.com/recaptcha/');
  });
  it('laisse passer Firebase et la mesure PostHog UE, et rien d’autre', () => {
    const connect = directive('connect-src').split(' ').slice(1);
    expect(connect.sort()).toEqual(
      ["'self'", 'https://*.googleapis.com', 'https://eu-assets.i.posthog.com', 'https://eu.i.posthog.com', 'https://www.google.com/recaptcha/'].sort(),
    );
  });
  it('index.html ne contient plus de script écrit dans la page', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const intégrés = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    expect(intégrés).toHaveLength(0);
  });
});

describe('App Check', () => {
  it('ne tourne que sur arvela.fr', () => {
    expect(appCheckActif('arvela.fr')).toBe(true);
    for (const h of ['www.arvela.fr', 'localhost', '127.0.0.1', 'arvela-app.web.app', 'arvela-app--pr-41.web.app']) {
      expect(appCheckActif(h)).toBe(false);
    }
  });
  it('utilise une clé de site reCAPTCHA', () => {
    expect(RECAPTCHA_SITE_KEY).toMatch(/^6L[\w-]{38}$/);
  });
});
