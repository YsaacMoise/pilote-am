"""Lecture d'un bulletin PDF dans l'écran Contrôle (pdf.js dans le navigateur)."""
import json, os, subprocess, sys, time, datetime, re
from playwright.sync_api import sync_playwright
sys.argv = [sys.argv[0]]
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open(os.path.join(ROOT, 'tests/e2e/shots.py')).read()
exec(src.split('errors = []')[0].replace("server = subprocess.Popen", "server = None and subprocess.Popen"))
PDF = os.environ['PDF']
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', os.path.join(ROOT, 'dist')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
URL = 'http://localhost:8766/'
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, locale='fr-FR', timezone_id='Europe/Paris')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.clock.install(time=datetime.datetime(2026, 10, 28, 8, 0, tzinfo=datetime.timezone.utc))
        pg.goto(URL + '?app'); pg.evaluate(SEED, json.dumps(STATE)); pg.goto(URL + '?app')
        pg.locator('nav.tabbar .tab', has_text='Suivi').click()
        pg.get_by_role('button', name=re.compile('^Contrôler un bulletin')).click()
        with pg.expect_file_chooser() as fc:
            pg.get_by_role('button', name='Lire le bulletin PDF').click()
        fc.value.set_files(PDF)
        pg.wait_for_selector('text=repris du PDF', timeout=15000)
        pg.wait_for_timeout(300)
        print(pg.locator('[role=status]').first.inner_text())
        for label in ['Heures normales', 'Jours d’activité', 'Salaire net', 'Salaire brut', 'Entretien', 'Repas']:
            print(label, '=', pg.get_by_label(label, exact=True).input_value())
        pg.screenshot(path=os.path.join(ROOT, 'mockups/app-shots/controle-pdf-light.png'), full_page=True)
        b.close()
finally:
    server.terminate()
    print('erreurs:', errs or 'aucune')
