"""Parcours et captures d'écran du site construit (dist/), à 390×844, clair et sombre.
Usage : python3 tests/e2e/shots.py [sortie]"""
import json, re, subprocess, sys, time, datetime, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'mockups', 'app-shots')
os.makedirs(OUT, exist_ok=True)
PORT = 8765
server = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', os.path.join(ROOT, 'dist')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
URL = f'http://localhost:{PORT}/'

def pattern(days, start, end):
    return {str(d): [{'start': start, 'end': end}] for d in days}

def contract(cid, child, fam, start, days, s, e, rate, meal=0, year='complete', weeks=52, non=None):
    return {'id': cid, 'childId': child, 'familyId': fam, 'startDate': start, 'yearType': year, 'programmedWeeks': weeks,
            'nonAccueil': non or [], 'pattern': pattern(days, s, e), 'hourlyNetMilli': rate, 'majorationPct': 10,
            'complementaryPct': 0, 'entretien': {'kind': 'minimum'}, 'mealCents': meal, 'kmMilli': 0,
            'cpPaymentMode': 'juin', 'childMajoration': False}

STATE = {
  'version': 1,
  'profile': {'firstName': 'Sandrine', 'hasProfessionalTitle': False, 'childrenBirthDates': [], 'atLeast21': True},
  'families': [{'id': 'f1', 'name': 'Moreau', 'parentNames': 'Julie et Marc'}, {'id': 'f2', 'name': 'Bernard', 'parentNames': ''},
               {'id': 'f3', 'name': 'Petit', 'parentNames': ''}, {'id': 'f4', 'name': 'Roux', 'parentNames': ''}],
  'children': [{'id': 'k1', 'familyId': 'f1', 'firstName': 'Lina', 'color': 'kid-1'}, {'id': 'k2', 'familyId': 'f2', 'firstName': 'Maël', 'color': 'kid-2'},
               {'id': 'k3', 'familyId': 'f3', 'firstName': 'Noé', 'color': 'kid-3'}, {'id': 'k4', 'familyId': 'f4', 'firstName': 'Inès', 'color': 'kid-4'}],
  'contracts': [contract('c1', 'k1', 'f1', '2026-09-01', [0,1,2,3], 450, 1050, 3800, 400),
                contract('c2', 'k2', 'f2', '2025-03-03', [0,1,2,3,4], 510, 1050, 4000),
                contract('c3', 'k3', 'f3', '2026-10-01', [0,1,2,3,4], 540, 1065, 3900),
                contract('c4', 'k4', 'f4', '2026-09-01', [1,2,3,4], 480, 1080, 4100, 0, 'incomplete', 40, [{'from': '2026-12-21', 'to': '2027-01-01'}])],
  'entries': [{'contractId': 'c1', 'date': '2026-10-28', 'arrival': 472}, {'contractId': 'c2', 'date': '2026-10-28', 'arrival': 510},
              {'contractId': 'c4', 'date': '2026-10-28', 'absence': 'enfant_malade'},
              {'contractId': 'c1', 'date': '2026-10-13', 'absence': 'enfant_malade', 'certificate': True},
              {'contractId': 'c1', 'date': '2026-10-21', 'arrival': 455, 'departure': 1080}],
  'amLeave': [{'from': '2026-08-03', 'to': '2026-08-22'}], 'history': [], 'openings': [], 'controls': [],
  'notes': [{'id': 'n1', 'childId': 'k1', 'date': '2026-10-28', 'time': 500, 'kind': 'humeur', 'text': 'Un peu fatiguée, a pleuré au départ de maman puis a joué'}],
  'sent': [], 'endings': [], 'journal': [], 'reports': [], 'daySent': [], 'settings': {'lastBackupAt': '2026-10-26T18:00:00.000Z'},
}

SEED = """async (json) => {
  await new Promise((res, rej) => {
    const r = indexedDB.open('pilote-am', 1);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('state'); db.createObjectStore('snapshots', { keyPath: 'day' }); };
    r.onsuccess = () => { const tx = r.result.transaction('state', 'readwrite'); tx.objectStore('state').put(json, 'main'); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = rej; };
    r.onerror = rej;
  });
}"""

errors = []
def watch(pg):
    pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
    pg.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') else None)

def ctx_for(b, scheme, hour=8, minute=47):
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme=scheme,
                        is_mobile=True, has_touch=True, locale='fr-FR', timezone_id='Europe/Paris')
    pg = ctx.new_page()
    pg.clock.install(time=datetime.datetime(2026, 10, 28, hour, minute, 0))
    watch(pg)
    return ctx, pg

def shot(pg, name):
    pg.wait_for_timeout(350)
    pg.screenshot(path=os.path.join(OUT, f'{name}.png'))

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # 1. Accueil dans le navigateur, puis création de profil et de contrat par l'interface
        ctx, pg = ctx_for(b, 'light')
        pg.goto(URL)
        shot(pg, 'welcome-light')
        pg.get_by_role('button', name='Continuer dans le navigateur pour essayer').click()
        pg.get_by_label('Ton prénom').fill('Sandrine')
        shot(pg, 'onboarding-light')
        pg.get_by_role('button', name='Continuer').click()
        pg.get_by_label('Prénom', exact=True).fill('Lina')
        pg.get_by_label('Nom de famille').fill('Moreau')
        pg.get_by_label('Début du contrat').fill('2026-09-01')
        for day in ['lundi', 'mardi', 'mercredi', 'jeudi']:
            pg.get_by_label(f'Accueil le {day}').check()
        pg.get_by_label('lundi, arrivée').fill('07:30')
        pg.get_by_label('lundi, départ').fill('17:30')
        for day in ['mardi', 'mercredi', 'jeudi']:
            pg.get_by_label(f'{day}, arrivée').fill('07:30')
            pg.get_by_label(f'{day}, départ').fill('17:30')
        pg.get_by_label('Salaire horaire net').fill('3,80')
        pg.get_by_label('Repas, par jour').fill('4,00')
        shot(pg, 'contract-form-light')
        pg.get_by_role('button', name='Créer le contrat').click()
        pg.wait_for_timeout(300)
        shot(pg, 'history-after-create-light')
        pg.get_by_role('button', name='Terminer plus tard').click()
        pg.wait_for_timeout(200)
        shot(pg, 'today-first-contract-light')
        pg.get_by_role('button', name='Arrivée', exact=True).first.click()
        shot(pg, 'today-after-arrival-light')
        ctx.close()

        # 2. État de démonstration, clair et sombre
        for scheme in ['light', 'dark']:
            ctx, pg = ctx_for(b, scheme)
            pg.goto(URL + '?app')
            pg.evaluate(SEED, json.dumps(STATE))
            pg.goto(URL + '?app')
            pg.wait_for_selector('text=Chez toi')
            shot(pg, f'today-{scheme}')
            pg.get_by_role('button', name=re.compile('^Lina,')).click()
            shot(pg, f'sheet-{scheme}')
            pg.get_by_role('button', name='Repas').click()
            shot(pg, f'sheet-note-{scheme}')
            pg.keyboard.press('Escape')
            pg.get_by_role('button', name='Noter pour les enfants présents').click()
            shot(pg, f'note-multi-{scheme}')
            pg.keyboard.press('Escape')
            pg.locator('nav.tabbar .tab', has_text='Mois').click()
            shot(pg, f'month-{scheme}')
            pg.mouse.wheel(0, 700)
            shot(pg, f'month-cal-{scheme}')
            pg.get_by_role('button', name='13, Malade').click()
            shot(pg, f'day-sheet-{scheme}')
            pg.keyboard.press('Escape')
            pg.get_by_role('button', name='Voir le détail du calcul').click()
            shot(pg, f'detail-{scheme}')
            pg.locator('nav.tabbar .tab', has_text='Suivi').click()
            shot(pg, f'suivi-{scheme}')
            pg.get_by_role('button', name=re.compile('^Congés payés')).click()
            shot(pg, f'conges-{scheme}')
            pg.locator('nav.tabbar .tab', has_text='Suivi').click()
            pg.get_by_role('button', name=re.compile('^Fin de contrat')).click()
            shot(pg, f'fin-{scheme}')
            pg.locator('nav.tabbar .tab', has_text='Suivi').click()
            pg.get_by_role('button', name=re.compile('^Contrôler un bulletin')).click()
            shot(pg, f'controle-{scheme}')
            pg.locator('nav.tabbar .tab', has_text='Suivi').click()
            pg.get_by_role('button', name=re.compile('^Impôts 2026')).click()
            shot(pg, f'impots-{scheme}')
            pg.locator('nav.tabbar .tab', has_text='Réglages').click()
            shot(pg, f'settings-{scheme}')
            pg.get_by_role('button', name=re.compile('^Maël')).click()
            pg.wait_for_timeout(200)
            pg.get_by_role('button', name='Historique avant l’app').click()
            shot(pg, f'history-{scheme}')
            ctx.close()

        # 3. Fin d'après-midi : dépassement et départs
        ctx, pg = ctx_for(b, 'light', 17, 52)
        pg.goto(URL + '?app')
        pg.evaluate(SEED, json.dumps(STATE))
        pg.goto(URL + '?app')
        pg.wait_for_selector('text=Chez toi')
        shot(pg, 'today-evening-light')
        pg.get_by_role('button', name='Départ', exact=True).first.click()
        shot(pg, 'today-evening-after-depart-light')
        ctx.close()
        b.close()
finally:
    server.terminate()
    print('\n'.join(errors) if errors else 'Aucune erreur de console')
