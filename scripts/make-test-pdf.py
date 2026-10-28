# Génère un bulletin fictif au format proche de Pajemploi, pour les tests (aucune donnée réelle).
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
out = sys.argv[1]
c = canvas.Canvas(out, pagesize=A4)
y = 800
for line in [
    "BULLETIN DE SALAIRE - TEST FICTIF",
    "Période d'emploi du 01/09/2026 au 30/09/2026",
    "Salarié : Assistant maternel agréé",
    "Enfant : Lou",
    "Nombre d'heures normales 160,00",
    "Nombre de jours d'activité 20",
    "Salaire brut 717,03",
    "Indemnités d'entretien 78,40",
    "Salaire net 560,00",
]:
    c.drawString(60, y, line); y -= 24
c.save()
