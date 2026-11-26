// Carte « Lien pour les parents » de l'écran Contrat (côté AM, tutoiement).
import { useState } from 'preact/hooks';
import { useCloud } from '../cloud-state';
import { isDemo } from '../db';
import { deleteJournal, logUsage, putContract, state, toast, useStore } from '../store';
import { estNoteSante } from '../engine/carnet';
import { today } from '../engine/dates';
import { shareText } from '../share';
import { shareUrl } from '../partage/crypto';
import { Banner, Sheet } from '../ui/kit';
import { AideVideo } from '../ui/VideoGuide';
import { Icon } from '../ui/icons';
import { de } from '../engine/texte';

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
          <p>Les parents {de(c.child)} suivent sa journée en direct et retrouvent leur déclaration Pajemploi prête à recopier, sans compte ni mot de passe.</p>
          <p class="hint">Ils verront :</p>
          <ul class="what">
            <li>les arrivées, départs et absences des 7 derniers jours</li>
            <li>le carnet (repas, sieste, change, tes notes{c.accordSante ? ', soins et températures' : ''})</li>
            <li>les montants du mois et les cases Pajemploi</li>
          </ul>
          <p class="hint">Ils ne peuvent rien modifier. Le nom de la famille n’est pas sur la page.</p>
        </>
      )}
      <Accord cid={cid} />
      {isDemo() ? (
        <Banner tone="info">Pas de lien pendant la démonstration : il passe par ton compte.</Banner>
      ) : !connecte ? (
        <>
          <Banner tone="info">Le lien passe par ton compte en ligne. Branche-le d’abord, c’est gratuit.</Banner>
          <a class="btn btn-outline btn-block" href="#/compte"><Icon name="user" />Brancher mon compte</a>
        </>
      ) : !k && cl.cleManquante ? (
        <Banner tone="info">Entre d’abord ta clé de secours (Plus › Compte) : le lien est chiffré avec elle.</Banner>
      ) : !k ? (
        <button class="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => run(async () => {
          await (await cloud()).createShare(cid);
          toast('Lien créé. Donne le code de vive voix.', undefined, 'ok');
        })}>{busy ? 'Création…' : 'Créer le lien'}</button>
      ) : !k.code || !k.secret ? (
        <Banner tone="info">Ce téléphone n’a pas encore ta clé de secours : le code du lien est chiffré. Entre la clé dans Plus › Compte.</Banner>
      ) : (
        <>
          <p>Code à donner aux parents <b>de vive voix</b> :</p>
          <p class="share-code" aria-label={`Code : ${k.code.split('').join(' ')}`}>{k.code}</p>
          <p class="hint">Le code n’est jamais dans le lien. Sans lui, la page reste fermée.</p>
          <div class="share-url">{url.replace(/^https?:\/\//, '')}</div>
          <button class="btn btn-primary btn-lg btn-block" disabled={busy} onClick={async () => {
            const res = await shareText(`Bonjour, voici le lien pour suivre la journée ${de(c.child)} et retrouver la déclaration Pajemploi du mois : ${url}\nJe vous donne le code à 4 chiffres de vive voix.${state.settings.amName ? `\n${state.settings.amName}` : ''}`);
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
            <p>La page des parents {de(c.child)} devient vide tout de suite. Tu pourras créer un nouveau lien, avec un nouveau code.</p>
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

/**
 * T-121 (option b) : accord écrit des parents pour noter la santé de l'enfant (soins, températures) et la leur montrer sur le
 * lien (RGPD art. 9.2.a). Retirer l'accord efface les notes de santé de l'enfant (RGPD art. 17.1.b).
 */
function Accord({ cid }: { cid: string }) {
  useStore();
  const c = state.contracts.find((x) => x.id === cid);
  const [retirer, setRetirer] = useState(false);
  if (!c) return null;
  const notes = state.journal.filter((j) => j.cid === cid && estNoteSante(j));
  const verrou = state.journal.some((j) => j.cid === cid && 'sante' in j);
  return (
    <div class="stack-sm">
      {c.accordSante ? (
        <p class="hint">Santé : accord écrit des parents noté le {c.accordSante.split('-').reverse().join('/')}. Les soins et températures sont notés, chiffrés de bout en bout, et montrés sur le lien.</p>
      ) : (
        <p class="hint">Santé : pas d’accord écrit des parents noté. Les soins et températures ne sont ni notés ni montrés.</p>
      )}
      {c.accordSante
        ? (verrou
          ? <p class="hint">Pour retirer l’accord, entre d’abord ta clé de secours (Plus › Compte) : certaines notes sont encore chiffrées sur ce téléphone.</p>
          : <button class="btn btn-ghost btn-block" onClick={() => setRetirer(true)}>Retirer l’accord des parents</button>)
        : <button class="btn btn-outline btn-block" onClick={async () => { await putContract({ ...c, accordSante: today() }); logUsage('accord_sante_parents', 'contrat'); }}>Les parents ont donné leur accord écrit</button>}
      {retirer && (
        <Sheet title="Retirer l’accord des parents ?" onClose={() => setRetirer(false)}>
          <div class="stack">
            <p>{notes.length ? `Les ${notes.length} notes de soin, de température ou de selles liquides ${de(c.child)} seront effacées, sur ce téléphone et dans ton compte.` : `Aucune note de soin ni de température ${de(c.child)} n’est enregistrée.`} Tu ne pourras plus en noter tant que les parents ne redonnent pas leur accord. Relis aussi tes notes libres : efface celles qui parlent de sa santé.</p>
            <button class="btn btn-danger btn-block" onClick={async () => {
              for (const j of notes) await deleteJournal(j.id);
              const { accordSante: _a, ...sans } = state.contracts.find((x) => x.id === cid) ?? c;
              await putContract(sans);
              logUsage('accord_sante_retire', 'contrat');
              setRetirer(false);
              toast('Accord retiré, notes de santé effacées.');
            }}>Retirer l’accord et effacer</button>
            <button class="btn btn-outline btn-block" onClick={() => setRetirer(false)}>Annuler</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
