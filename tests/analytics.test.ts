import { describe, expect, it } from 'vitest';
import { state } from '../src/store';
import { pseudonymise } from '../src/analytics';

describe('mesure d’usage : pseudonymisation avant envoi', () => {
  it('remplace prénoms, familles et prénom de l’AM, sans toucher au reste', () => {
    state.contracts = [
      { id: 'a', child: 'Léo', family: 'Martin', createdAt: 1 } as any,
      { id: 'b', child: 'Marie-Lou', family: 'Durand', createdAt: 2 } as any,
      { id: 'c', child: 'Marie', family: 'Martin', createdAt: 3 } as any,
    ];
    state.settings = { ...state.settings, amName: 'Sonia' } as any;
    expect(pseudonymise('Arrivée de Léo à 8h, famille Martin')).toBe('Arrivée de Enfant 1 à 8h, famille Famille 1');
    expect(pseudonymise('Marie-Lou et Marie, LÉO')).toBe('Enfant 2 et Enfant 3, Enfant 1');
    expect(pseudonymise('Merci ! Sonia')).toBe('Merci ! AM');
    expect(pseudonymise('Léonard reste Léonard')).toBe('Léonard reste Léonard');
    expect(pseudonymise('Malade, avec certificat : 713,81 €')).toBe('Malade, avec certificat : 713,81 €');
    expect(pseudonymise('Connectée : sonia.dupont@example.com')).toBe('Connectée : e-mail masqué');
    // Prénom élidé (« d’Adam ») : masqué aussi
    state.contracts = [{ id: 'd', child: 'Adam', family: 'Petit', createdAt: 1 } as any];
    expect(pseudonymise("La journée d’Adam, arrivée d'Adam")).toBe("La journée d’Enfant 1, arrivée d'Enfant 1");
  });
});

import { deep, ecranCourant, posthogOptions, setMesure, mesureActive } from '../src/analytics';

describe('mesure d’usage : réglages après audit (C-030 à C-034)', () => {
  it('aucun enregistrement d’écran, aucune capture automatique, aucun profil de personne', () => {
    const o: any = posthogOptions();
    expect(o.disable_session_recording).toBe(true);
    expect(o.autocapture).toBe(false);
    expect(o.enable_heatmaps).toBe(false);
    expect(o.capture_heatmaps).toBe(false);
    expect(o.capture_dead_clicks).toBe(false);
    expect(o.capture_exceptions).toBe(false);
    expect(o.capture_performance).toBe(false);
    expect(o.capture_pageleave).toBe(false);
    expect(o.person_profiles).toBe('never');
    expect(o.session_recording.recordBody).toBe(false);
    expect(o.session_recording.recordHeaders).toBe(false);
  });

  it('pseudonymise à toute profondeur (l’ancienne limite était 6 niveaux)', () => {
    state.contracts = [{ id: 'a', child: 'Anaïs', family: 'Petit', createdAt: 1 } as any];
    let v: any = 'Anaïs Petit';
    for (let i = 0; i < 12; i++) v = { x: [v] };
    expect(JSON.stringify(deep(v))).not.toMatch(/Anaïs|Petit/);
  });

  it('le nom d’écran ne garde ni identifiant de contrat ni paramètre', () => {
    expect(ecranCourant('#/contrat/k7f3x9')).toBe('contrat');
    expect(ecranCourant('#/mois?c=demo-leo')).toBe('mois');
    expect(ecranCourant('')).toBe('aujourdhui');
  });

  it('active par défaut (exemption CNIL) ; l’éteindre efface les clés PostHog du téléphone', () => {
    const store = new Map<string, string>();
    const ls: any = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
    (globalThis as any).localStorage = ls;
    (globalThis as any).sessionStorage = { ...ls };
    expect(mesureActive()).toBe(true);
    store.set('ph_phc_xxx_posthog', '{"distinct_id":"abc"}');
    store.set('__ph_opt_in_out_phc_xxx', '1');
    store.set('pam-mesure-depuis', '123');
    store.set('pam-autre', 'garde');
    setMesure(false);
    expect(mesureActive()).toBe(false);
    // La clé de refus de PostHog est gardée (sinon PostHog repasse en « non décidé » et renvoie).
    expect([...store.keys()].sort()).toEqual(['__ph_opt_in_out_phc_xxx', 'pam-autre', 'pam-mesure-refus', 'pam-mesure-v2']);
    setMesure(true);
    expect(mesureActive()).toBe(true);
  });
});

import { renouvelerIdentifiant, DUREE_IDENTIFIANT_MS } from '../src/analytics';

function stockage() {
  const store = new Map<string, string>();
  const ls: any = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  (globalThis as any).localStorage = ls;
  (globalThis as any).sessionStorage = { ...ls };
  return store;
}

describe('mesure d’usage active par défaut : conditions de l’exemption CNIL (04/11/2026)', () => {
  it('une utilisatrice qui avait éteint la mesure reste refusée après la mise à jour', () => {
    const store = stockage();
    store.set('__ph_opt_in_out_phc_o2Y', '0');
    expect(mesureActive()).toBe(false);
    expect(store.get('pam-mesure-refus')).toBe('1');
  });
  it('une utilisatrice qui l’avait allumée, ou jamais réglée, passe à la mesure active ; l’ancienne clé disparaît', () => {
    const store = stockage();
    store.set('pam-mesure-on', '1');
    store.set('__ph_opt_in_out_phc_o2Y', '1');
    expect(mesureActive()).toBe(true);
    expect(store.has('pam-mesure-on')).toBe(false);
    stockage();
    expect(mesureActive()).toBe(true);
  });
  it('la migration ne joue qu’une fois : rallumer après un refus reste allumé', () => {
    const store = stockage();
    store.set('__ph_opt_in_out_phc_o2Y', '0');
    expect(mesureActive()).toBe(false);
    setMesure(true);
    expect(mesureActive()).toBe(true);
  });
  it('identifiant au hasard renouvelé au plus tard après 13 mois, sans prolongation à chaque visite', () => {
    const store = stockage();
    const t0 = Date.UTC(2026, 10, 4);
    renouvelerIdentifiant(t0);
    expect(store.get('pam-mesure-depuis')).toBe(String(t0));
    store.set('ph_phc_x_posthog', '{"distinct_id":"abc"}');
    // Visite 12 mois plus tard : rien ne change, la date de départ n'est pas repoussée.
    renouvelerIdentifiant(t0 + DUREE_IDENTIFIANT_MS - 1000);
    expect(store.get('pam-mesure-depuis')).toBe(String(t0));
    expect(store.has('ph_phc_x_posthog')).toBe(true);
    // Au-delà de 13 mois : identifiant effacé, nouvelle date.
    const t1 = t0 + DUREE_IDENTIFIANT_MS + 1000;
    renouvelerIdentifiant(t1);
    expect(store.has('ph_phc_x_posthog')).toBe(false);
    expect(store.get('pam-mesure-depuis')).toBe(String(t1));
    expect(DUREE_IDENTIFIANT_MS).toBeLessThanOrEqual(396 * 24 * 3600 * 1000);
  });
  it('aucune adresse internet, aucune géolocalisation, aucune propriété de personne ne part', () => {
    stockage();
    const ev = posthogOptions().before_send({ event: 'arrivee', properties: { $ip: '1.2.3.4', ecran: 'aujourdhui' }, $set: { email: 'x@y.fr' }, $set_once: { a: 1 } });
    expect(ev.properties.$ip).toBeUndefined();
    expect(ev.properties.$geoip_disable).toBe(true);
    expect(ev.$set).toBeUndefined();
    expect(ev.$set_once).toBeUndefined();
  });
});

import { nettoyerAdresse } from '../src/analytics';

describe('mesure d’usage : contrôle indépendant du 31 octobre 2026', () => {
  it('aucune adresse ne garde l’identifiant de contrat', () => {
    expect(nettoyerAdresse('http://arvela.test:4173/#/contrat/mvwozc0cv6zb9i')).toBe('http://arvela.test:4173/#/contrat');
    expect(nettoyerAdresse('https://arvela.fr/#/mois/2026-10/abc?x=1')).toBe('https://arvela.fr/#/mois');
    expect(nettoyerAdresse('https://arvela.fr/#/')).toBe('https://arvela.fr/#/aujourdhui');
  });
  it('before_send nettoie $current_url et $session_entry_url, et ne laisse rien partir sans accord', () => {
    const o: any = posthogOptions();
    (globalThis as any).localStorage.removeItem('pam-mesure-refus');
    const ev = o.before_send({ event: 'ecran', properties: { $current_url: 'https://arvela.fr/#/contrat/k7f3', $session_entry_url: 'https://arvela.fr/#/fin/k7f3', title: 'Contrat · Arvela' } });
    expect(ev.properties.$current_url).toBe('https://arvela.fr/#/contrat');
    expect(ev.properties.$session_entry_url).toBe('https://arvela.fr/#/fin');
    (globalThis as any).localStorage.setItem('pam-mesure-refus', '1');
    expect(o.before_send({ event: 'ecran', properties: {} })).toBeNull();
  });
  it('éteindre garde la clé de refus de PostHog, et efface l’identifiant', () => {
    const ls: any = (globalThis as any).localStorage;
    ls.removeItem('pam-mesure-refus');
    ls.setItem('ph_phc_x_posthog', '{"distinct_id":"abc"}');
    ls.setItem('__ph_opt_in_out_phc_x', '0');
    setMesure(false);
    expect(ls.getItem('ph_phc_x_posthog')).toBeNull();
    expect(ls.getItem('__ph_opt_in_out_phc_x')).toBe('0');
  });
});
