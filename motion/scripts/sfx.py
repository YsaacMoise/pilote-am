# Petits sons d'interface fabriqués ici (aucune banque de sons extérieure) : doux, courts, feutrés.
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
SR = 48000
rng = np.random.default_rng(7)
def env(n, a=0.002, d=0.08):
    t = np.arange(n) / SR
    return np.minimum(1, t / a) * np.exp(-t / d)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], btype='band', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(2, f, btype='low', fs=SR, output='sos'), x)
def norm(x, peak): return x / (np.abs(x).max() + 1e-9) * peak
def save(name, x): sf.write(f'/home/claude/arvela-motion/public/sfx/{name}.wav', x.astype(np.float32), SR)

# Toucher : petit clic boisé (bruit filtré + corps grave)
n = int(0.06 * SR); t = np.arange(n) / SR
tap = bp(rng.standard_normal(n), 1800, 5200) * env(n, 0.0005, 0.006) + 0.6 * np.sin(2 * np.pi * 180 * t) * env(n, 0.001, 0.018)
save('tap', norm(tap, 0.5))
# Apparition : « pop » arrondi, hauteur qui descend
n = int(0.12 * SR); t = np.arange(n) / SR
f = 950 * np.exp(-t * 9) + 520
pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.002, 0.035)
save('pop', norm(lp(pop, 4000), 0.45))
# Souffle : bruit dont le filtre monte puis s'éteint
def whoosh(dur, lo, hi, peak):
    n = int(dur * SR); x = rng.standard_normal(n); out = np.zeros(n); blk = 480
    for i in range(0, n, blk):
        k = i / n; c = lo * (hi / lo) ** k
        seg = x[max(0, i - 2000):i + blk]
        y = bp(seg, c * 0.7, min(c * 1.4, 20000))
        out[i:i + blk] = y[-len(out[i:i + blk]):]
    shape = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.6
    return norm(out * shape, peak)
save('whoosh', whoosh(0.55, 250, 3200, 0.35))
save('swipe', whoosh(0.28, 600, 4000, 0.25))
# Carillon du logo : partiels de cloche, longue extinction
n = int(2.2 * SR); t = np.arange(n) / SR
chime = sum(a * np.sin(2 * np.pi * fr * t) * np.exp(-t / dcy) for fr, a, dcy in [(659.3, 1, 0.9), (987.8, 0.55, 0.6), (1318.5, 0.3, 0.4), (1977, 0.12, 0.25)])
chime *= np.minimum(1, t / 0.004)
save('chime', norm(chime, 0.35))
# Notification « envoyé » : deux notes rapprochées
n = int(0.5 * SR); t = np.arange(n) / SR
def note(fr, start):
    tt = np.clip(t - start, 0, None); on = (t >= start)
    return on * np.sin(2 * np.pi * fr * tt) * np.exp(-tt / 0.18) * np.minimum(1, tt / 0.003)
save('envoye', norm(note(880, 0) + 0.8 * note(1318.5, 0.09), 0.35))
print('ok')
