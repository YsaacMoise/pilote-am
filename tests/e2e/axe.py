"""Audit d'accessibilité (axe-core, WCAG 2.1 AA) sur les écrans principaux, clair et sombre."""
import json, os, subprocess, sys, time, datetime, re
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
src = open(os.path.join(ROOT, 'tests/e2e/shots.py')).read()
exec(src.split('errors = []')[0].replace("server = subprocess.Popen", "server = None and subprocess.Popen"))
AXE = open(os.path.join(ROOT, 'node_modules/axe-core/axe.min.js')).read()
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8767', '-d', os.path.join(ROOT, 'dist')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.6)
URL = 'http://localhost:8767/'
def audit(pg, name):
    pg.wait_for_timeout(300)
    pg.add_script_tag(content=AXE)
    res = pg.evaluate("async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','wcag21aa'] }); return r.violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0,2).map(n => n.target.join(' ') + ' :: ' + (n.failureSummary||'').split('\\n').slice(1,2).join(''))})); }")
    for v in res:
        print(f"[{name}] {v['impact']} {v['id']} x{v['n']}")
        for e in v['ex']: print('    ', e[:230])
    if not res: print(f'[{name}] ok')
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for scheme in ['light', 'dark']:
            ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme=scheme, locale='fr-FR', timezone_id='Europe/Paris')
            pg = ctx.new_page()
            pg.clock.install(time=datetime.datetime(2026, 10, 28, 7, 47, tzinfo=datetime.timezone.utc))
            pg.goto(URL + '?app'); pg.evaluate(SEED, json.dumps(STATE)); pg.goto(URL + '?app')
            pg.wait_for_selector('text=Chez toi')
            audit(pg, f'today-{scheme}')
            pg.get_by_role('button', name=re.compile('^Lina, arrivée')).click(); audit(pg, f'sheet-{scheme}')
            pg.keyboard.press('Escape')
            pg.locator('nav.tabbar .tab', has_text='Mois').click(); audit(pg, f'month-{scheme}')
            pg.get_by_role('button', name='13, Malade').click(); audit(pg, f'day-{scheme}')
            pg.keyboard.press('Escape')
            pg.locator('nav.tabbar .tab', has_text='Suivi').click(); audit(pg, f'suivi-{scheme}')
            pg.get_by_role('button', name=re.compile('^Contrôler un bulletin')).click(); audit(pg, f'controle-{scheme}')
            pg.locator('nav.tabbar .tab', has_text='Réglages').click(); audit(pg, f'settings-{scheme}')
            pg.get_by_role('button', name=re.compile('^Lina')).click(); audit(pg, f'contract-{scheme}')
            ctx.close()
        b.close()
finally:
    server.terminate()
