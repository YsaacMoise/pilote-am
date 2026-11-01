// Carte « Lien pour les parents » de l'écran Contrat (côté AM, tutoiement).
import { useState } from 'preact/hooks';
import { useCloud } from '../cloud-state';
import { isDemo } from '../db';
import { logUsage, state, toast, useStore } from '../store';
import { shareText } from '../share';
import { shareUrl } from '../partage/crypto';
import { Banner, Sheet } from '../ui/kit';
import { AideVideo } from '../ui/VideoGuide';
import { Icon } from '../ui/icons';

const cloud = () => import('../cloud');

export function PartageCard({ cid }: { cid: string }) {
  useStore();
  const cl = useCloud();
  const c = state.contracts.find((x) => x.id === cid);
  const [busy, setBusy] = useState(false);
  const [couper, setCouper] = useState(false);
  if (!c) return null;
  const k = c.partage;
  const connecte = !!cl.email && cl.status !== 'off' && cl.status !== 'choice';
  const url = k ? shareUrl(k, location.origin.includes('localhost') || location.origin.includes('127.0.0.1') ? `${location.origin}${location.pathname.replace(/\/$/, '')}` : 'https://arvela.fr') : '';

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try { await f(); } catch (e) { toast((e as Error).message, undefined, 'warn'); } finally { setBusy(false); }
  };

  return (
    <section class="card stack-sm" aria-labelledby="partage-t">
      <h2 id="partage-t" class="row"><Icon name="users" />Lien pour les parents</h2>
      <AideVideo id="inviter" />
      {!k && (
        <>
          <p>Les parents de {c.child} suivent sa journée en direct et retrouvent leur déclaration Pajemploi prête à recopier, sans compte ni mot de passe.</p>
          <p class="hint">Ils verront :</p>
          <ul class="what">
            <li>les arrivées, départs et absences des 7 derniers jours</li>
            <li>le carnet (repas, sieste, change, tes notes)</li>
            <li>les montants du mois et les cases Pajemploi</li>
          </ul>
          <p class="hint">Ils ne peuvent rien modifier. Le nom de la famille n’est pas sur la page.</p>
        </>
      )}
      {isDemo() ? (
        <Banner tone="info">Pas de lien pendant la démonstration : il passe par ton compte.</Banner>
      ) : !connecte ? (
        <>
          <Banner tone="info">Le lien passe par ton compte en ligne. Branche-le d’abord, c’est gratuit.</Banner>
          <a class="btn btn-outline btn-block" href="#/compte"><Icon name="user" />Brancher mon compte</a>
        </>
      ) : !k ? (
        <button class="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => run(async () => {
          await (await cloud()).createShare(cid);
          toast('Lien créé. Donne le code de vive voix.', undefined, 'ok');
        })}>{busy ? 'Création…' : 'Créer le lien'}</button>
      ) : (
        <>
          <p>Code à donner aux parents <b>de vive voix</b> :</p>
          <p class="share-code" aria-label={`Code : ${k.code.split('').join(' ')}`}>{k.code}</p>
          <p class="hint">Le code n’est jamais dans le lien. Sans lui, la page reste fermée.</p>
          <div class="share-url">{url.replace(/^https?:\/\//, '')}</div>
          <button class="btn btn-primary btn-lg btn-block" disabled={busy} onClick={async () => {
            const res = await shareText(`Bonjour, voici le lien pour suivre la journée de ${c.child} et retrouver la déclaration Pajemploi du mois : ${url}\nJe vous donne le code à 4 chiffres de vive voix.${state.settings.amName ? `\n${state.settings.amName}` : ''}`);
            logUsage('lien_parent_envoye', 'contrat');
            if (res === 'copied') toast('Message copié : colle-le dans ton message aux parents.');
          }}><Icon name="share" />Envoyer le lien aux parents</button>
          <a class="btn btn-outline btn-block" href={url} target="_blank" rel="noopener">Voir ce que voient les parents</a>
          <button class="btn btn-ghost btn-block" disabled={busy} onClick={() => setCouper(true)}>Couper ce lien</button>
          <p class="hint">La page se met à jour toute seule tant que ton compte est branché.</p>
        </>
      )}
      {couper && (
        <Sheet title="Couper le lien ?" onClose={() => setCouper(false)}>
          <div class="stack">
            <p>La page des parents de {c.child} devient vide tout de suite. Tu pourras créer un nouveau lien, avec un nouveau code.</p>
            <button class="btn btn-danger btn-block" disabled={busy} onClick={() => run(async () => {
              const fait = await (await cloud()).cutShare(cid);
              setCouper(false);
              toast(fait ? 'Lien coupé.' : 'Lien coupé. La page des parents se fermera dès que le réseau reviendra.', undefined, 'ok');
            })}>{busy ? 'Coupure…' : 'Couper le lien'}</button>
            <button class="btn btn-outline btn-block" onClick={() => setCouper(false)}>Garder le lien</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
