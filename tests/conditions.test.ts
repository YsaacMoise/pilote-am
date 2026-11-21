// Conditions d'utilisation (volet légal avant l'ouverture) : la page s'affiche, porte sa date,
// contient le contrat de traitement des données (article 28 du RGPD), et elle est liée partout
// où les autres pages légales le sont, ainsi qu'à la création du compte.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Fragment, type VNode } from 'preact';
import { Conditions } from '../src/screens/Conditions';
import { LEGAL } from '../src/legal';

const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

/** Arbre de la page, sans navigateur : les composants enfants (Topbar) ne sont pas exécutés, seuls leurs attributs sont lus. */
function parcourir(n: unknown, textes: string[], liens: string[], titres: string[]) {
  if (n == null || typeof n === 'boolean') return;
  if (typeof n === 'string' || typeof n === 'number') { textes.push(String(n)); return; }
  if (Array.isArray(n)) { n.forEach((x) => parcourir(x, textes, liens, titres)); return; }
  const v = n as VNode<any>;
  const p = v.props ?? {};
  if (typeof v.type === 'function' && v.type !== Fragment) {
    if (typeof p.title === 'string') titres.push(p.title);
    if (typeof p.screen === 'string') titres.push(`ecran:${p.screen}`);
  }
  if (v.type === 'a' && typeof p.href === 'string') liens.push(p.href);
  if (v.type === 'h2' || v.type === 'h3') titres.push(texte(p.children));
  parcourir(p.children, textes, liens, titres);
}

function texte(n: unknown): string {
  const t: string[] = [];
  parcourir(n, t, [], []);
  return t.join('');
}

function page(back?: string) {
  const textes: string[] = [], liens: string[] = [], titres: string[] = [];
  const racine = Conditions(back ? { back } : {});
  parcourir(racine, textes, liens, titres);
  return { texte: textes.join(''), liens, titres, racine };
}

describe('page Conditions d’utilisation', () => {
  it('s’affiche avec son titre, son écran et sa date de mise à jour', () => {
    const p = page();
    expect(p.titres).toContain('Conditions d’utilisation');
    expect(p.titres).toContain('ecran:conditions');
    expect(p.texte).toContain(`Mise à jour le ${LEGAL.majConditions}.`);
    expect(LEGAL.majConditions).toMatch(/^\d{1,2} (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}$/);
  });

  it('contient le contrat de traitement des données et ses clauses de l’article 28', () => {
    const p = page();
    expect(p.titres).toContain('Contrat de traitement des données');
    expect(p.texte).toContain('article 28');
    for (const clause of ['Tes instructions.', 'La confidentialité.', 'La sécurité.', 'Les autres prestataires.', 'Les droits des personnes.', 'Les incidents.', 'L’analyse d’impact.', 'La fin du contrat.', 'Les vérifications.']) {
      expect(p.texte).toContain(clause);
    }
    // Objet, durée, nature, finalité, types de données, catégories de personnes
    for (const t of ['Ce qu’Arvela fait :', 'Pourquoi :', 'Combien de temps :', 'Les enfants accueillis :', 'Les parents qui t’emploient :', 'Toi :']) {
      expect(p.texte).toContain(t);
    }
    expect(p.texte).toContain(`${LEGAL.joursSauvegardes} jours`);
  });

  it('renvoie vers la politique de confidentialité et les mentions légales', () => {
    const p = page();
    expect(p.liens).toContain('#/confidentialite');
    expect(p.liens).toContain('#/mentions');
  });

  it('retour vers l’accueil quand elle est ouverte avant la création du compte', () => {
    const racine = Conditions({ back: '#/' }) as VNode<any>;
    const topbar = (racine.props.children as VNode<any>[])[0];
    expect(topbar.props.back).toBe('#/');
  });
});

describe('liens vers les conditions d’utilisation', () => {
  it('route dans l’app, avant et après la création du compte', () => {
    const app = lire('src/app.tsx');
    expect(app).toContain(`if (p === 'conditions') return <><Conditions back="#/" /><Toaster /></>;`);
    expect(app).toContain(`case 'conditions': screen = <Conditions />; break;`);
    expect(app).toContain(`conditions: 'Conditions d’utilisation'`);
  });

  it('présents partout où les autres pages légales sont liées', () => {
    const welcome = lire('src/screens/Welcome.tsx');
    // en-tête du site et pied de page
    expect(welcome.match(/href="#\/conditions"/g)).toHaveLength(2);
    expect(welcome.match(/href="#\/mentions"/g)).toHaveLength(2);
    expect(lire('src/screens/Plus.tsx')).toContain('href="#/conditions"');
    expect(lire('src/screens/Mentions.tsx')).toContain('href="#/conditions"');
    expect(lire('src/screens/Confidentialite.tsx')).toContain('href="#/conditions"');
  });

  it('annoncés à la création du compte, sans case à cocher', () => {
    const compte = lire('src/screens/Compte.tsx');
    expect(compte).toContain('En créant ton compte, tu acceptes les <a href="#/conditions">Conditions d’utilisation</a>.');
    expect(compte).not.toMatch(/type="checkbox"/);
  });
});

describe('accord aux conditions d’utilisation', () => {
  it('à la création du compte : version et date gardées dans les réglages copiés dans le compte', async () => {
    const { acceptationConditions, CONDITIONS_VERSION } = await import('../src/legal');
    expect(acceptationConditions(new Date(2026, 10, 4, 23, 30))).toEqual({ version: CONDITIONS_VERSION, date: '2026-11-04' });
    expect(acceptationConditions(new Date(2027, 0, 9))).toEqual({ version: CONDITIONS_VERSION, date: '2027-01-09' });
    const cloud = lire('src/cloud.ts');
    const creation = cloud.slice(cloud.indexOf('export async function createAccount'), cloud.indexOf('export async function signIn'));
    expect(creation).toContain('saveSettings({ conditionsAcceptees: acceptationConditions() })');
    // Les réglages sont copiés dans le compte, sauf les champs propres à l'appareil : l'accord n'en fait pas partie.
    const { forRemote } = await import('../src/sync/plan');
    const envoye = forRemote('kv', 'settings', { k: 'settings', v: { amName: '', enfantsACharge: 0, conditionsAcceptees: { version: CONDITIONS_VERSION, date: '2026-11-04' } } }) as { v: Record<string, unknown> };
    expect(envoye.v.conditionsAcceptees).toEqual({ version: CONDITIONS_VERSION, date: '2026-11-04' });
  });

  it('message aux comptes existants tant que la version en vigueur n’est pas acceptée', async () => {
    const { conditionsAAccepter, CONDITIONS_VERSION, MESSAGE_CONDITIONS } = await import('../src/legal');
    expect(conditionsAAccepter({ onboarded: true })).toBe(true);
    expect(conditionsAAccepter({ onboarded: true, conditionsAcceptees: { version: '2026-01-01' } })).toBe(true);
    expect(conditionsAAccepter({ onboarded: true, conditionsAcceptees: { version: CONDITIONS_VERSION } })).toBe(false);
    // Avant l'installation (site public) : pas de message, la phrase de la création du compte suffit.
    expect(conditionsAAccepter({ onboarded: false })).toBe(false);
    expect(MESSAGE_CONDITIONS).toBe('Les conditions d’utilisation ont changé le 4 novembre 2026. Elles contiennent désormais le contrat de traitement des données.');
  });

  it('le message propose « Lire » et « J’accepte », qui enregistre la version et la date', () => {
    const app = lire('src/app.tsx');
    const bandeau = app.slice(app.indexOf('function ConditionsBanner'), app.indexOf('function useHash'));
    expect(bandeau).toContain('href="#/conditions">Lire</a>');
    expect(bandeau).toContain('saveSettings({ conditionsAcceptees: acceptationConditions() })');
    expect(bandeau).toContain('J’accepte');
    expect(bandeau).toContain('isDemo()');
    expect(app).toContain('<ConditionsBanner />');
  });
});

describe('message aux parents', () => {
  it('annonce les données de santé utiles au calcul et le droit de saisir la CNIL', async () => {
    const { TEXTE_PARENTS } = await import('../src/legal');
    expect(TEXTE_PARENTS).toContain('le motif « malade » d\'une absence');
    expect(TEXTE_PARENTS).toContain('situation de handicap ou de maladie');
    expect(TEXTE_PARENTS).toContain('saisir la CNIL');
  });
});
