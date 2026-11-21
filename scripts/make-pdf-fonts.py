# Polices du relevé PDF : TTF statiques tirés des paquets @fontsource installés (licence SIL OFL 1.1).
# pdf-lib n'embarque que du TTF/OTF : on décompresse les woff2, on fige les polices variables à une graisse,
# et on réunit les sous-ensembles « latin » et « latin étendu » (Ł, ğ, ş, ţ, ă, ę… : prénoms polonais, turcs, roumains).
# Usage : python3 scripts/make-pdf-fonts.py   (demande fonttools et brotli)
from pathlib import Path
from tempfile import TemporaryDirectory
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger

ROOT = Path(__file__).resolve().parent.parent
NM = ROOT / 'node_modules'
OUT = ROOT / 'src' / 'releve' / 'polices'
OUT.mkdir(parents=True, exist_ok=True)

CG = '@fontsource/cormorant-garamond/files/cormorant-garamond-{s}-600-normal.woff2'
PJ = '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-{s}-wght-normal.woff2'
JB = '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-{s}-wght-normal.woff2'
FONTS = {
    'cormorant-600.ttf': (CG, None),
    'jakarta-400.ttf': (PJ, 400),
    'jakarta-700.ttf': (PJ, 700),
    'jetbrains-400.ttf': (JB, 400),
    'jetbrains-700.ttf': (JB, 700),
}

with TemporaryDirectory() as tmp:
    for name, (pat, w) in FONTS.items():
        parts = []
        for sub in ('latin', 'latin-ext'):
            f = TTFont(NM / pat.format(s=sub))
            if w is not None:
                f = instancer.instantiateVariableFont(f, {'wght': w})
            f.flavor = None
            p = Path(tmp) / f'{sub}-{name}'
            f.save(p)
            parts.append(str(p))
        merged = Merger().merge(parts)
        merged.save(OUT / name)

for p in sorted(OUT.glob('*.ttf')):
    cmap = TTFont(p).getBestCmap()
    manque = [c for c in 'ŁłğŞşŢţăĂęćźżŸœŒ€’ «»éèàçù' if ord(c) not in cmap]
    print(p.name, p.stat().st_size, 'manque :', ''.join(manque) or 'rien')
