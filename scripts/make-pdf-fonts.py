# Polices du relevé PDF : TTF statiques tirés des paquets @fontsource installés (licence SIL OFL 1.1).
# pdf-lib n'embarque que du TTF/OTF : on décompresse les woff2 et on fige les polices variables à une graisse.
# Usage : python3 scripts/make-pdf-fonts.py   (demande fonttools et brotli)
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
NM = ROOT / 'node_modules'
OUT = ROOT / 'src' / 'releve' / 'polices'
OUT.mkdir(parents=True, exist_ok=True)

STATIC = {
    'cormorant-600.ttf': '@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff2',
}
VARIABLE = {
    'jakarta-400.ttf': ('@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2', 400),
    'jakarta-700.ttf': ('@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2', 700),
    'jetbrains-400.ttf': ('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 400),
    'jetbrains-700.ttf': ('@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 700),
}

for name, src in STATIC.items():
    f = TTFont(NM / src)
    f.flavor = None
    f.save(OUT / name)
for name, (src, w) in VARIABLE.items():
    f = TTFont(NM / src)
    f = instancer.instantiateVariableFont(f, {'wght': w})
    f.flavor = None
    f.save(OUT / name)
for p in sorted(OUT.glob('*.ttf')):
    print(p.name, p.stat().st_size)
