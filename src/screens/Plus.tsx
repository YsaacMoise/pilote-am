import { useState } from 'preact/hooks';
import { ctxFor, useStore } from '../store';
import { isDemo } from '../db';
import { statusLine, useCloud } from '../cloud-state';
import { daysBetween, today } from '../engine/dates';
import { compteursCP } from '../engine/compteurs-cp';
import { BrouillonsEnCours, libelleDebut } from './Fiche';
import { Gommette, ListLink, Sheet, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';
import { VIDEOS_PRETES, nbVideos } from '../ui/VideoGuide';

/** Congés : même écriture que la fiche de l'enfant (jamais « -0 »). */
const nb = (x: number) => (Math.abs(x) < 0.05 ? 0 : x).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/**
 * Vision 1.1 (T-126, 4 et 9.8) : enfants en pastilles et « Ajouter » ; tuiles Simuler un accueil, Mes congés, Compte, Impôts ;
 * liste Contrôler un bulletin, Sauvegarde, Réglages, Aide, Données du pilote, Légal. Aide et Légal s'ouvrent en feuilles du bas,
 * sans nouvelle route. Rien n'est retiré : chaque entrée de la Vision 1.0 garde son écran.
 */
export function Plus() {
  const s = useStore();
  const cloud = useCloud();
  const demo = isDemo();
  const t = today();
  const lastB = s.settings.lastBackup;
  const [feuille, setFeuille] = useState<'aide' | 'legal' | null>(null);
  // Contrats en cours d'abord, puis les contrats terminés (fin, historique), plus pâles.
  const enCours = s.contracts.filter((c) => !c.end || c.end >= t);
  const termines = s.contracts.filter((c) => c.end && c.end < t);
  // Mes congés : un chiffre seulement avec un seul contrat (9.8).
  const seul = enCours.length === 1 && !enCours[0].accueilOccasionnel ? enCours[0] : undefined;
  const cp = seul ? compteursCP(ctxFor(seul), t, s.settings.enfantsACharge) : undefined;
  const reste = cp?.reste;
  const droits = cp?.droits;
  const etatCompte = cloud.email ? (cloud.verified === false ? 'adresse e-mail non vérifiée' : statusLine(cloud)) : statusLine(cloud);
  const joursSauvegarde = lastB ? daysBetween(new Date(lastB).toISOString().slice(0, 10), t) : undefined;
  return (
    <>
      <Topbar title="Plus" screen="plus" />
      <main class="plus">
        <section aria-labelledby="enf">
          <h2 id="enf" class="sr-only">Les enfants accueillis</h2>
          <div class="plus-enfants">
            {[...enCours, ...termines].map((c) => (
              // Classes « li » et « li-title » gardées : les parcours e2e retrouvent l'enfant comme dans la Vision 1.0.
              <a class={`li pe-enfant${c.end && c.end < t ? ' termine' : ''}`} href={`#/enfant/${c.id}`} aria-label={`${c.child}, ${libelleDebut(c, t)}`}>
                <Gommette name={c.child} color={c.color} size="lg" />
                <span class="li-title pe-nom">{c.child}</span>
              </a>
            ))}
            <a class="pe-enfant pe-ajouter" href="#/contrat/nouveau" aria-label="Ajouter un enfant accueilli">
              <span class="pe-plus" aria-hidden="true"><Icon name="plus" /></span>
              <span class="pe-nom" aria-hidden="true">Ajouter</span>
            </a>
          </div>
          <div class="list pe-brouillons"><BrouillonsEnCours liste /></div>
        </section>

        <section class="plus-tuiles" aria-label="Paie et droits">
          <a class="tuile tuile-encre" href="#/simulateur">
            <span class="tuile-titre">Simuler un accueil</span>
            <span class="tuile-valeur">Nouvelle famille <Icon name="right" size={20} /></span>
            <span class="sr-only">Pour une nouvelle famille : coût, aide de la CAF</span>
          </a>
          <a class="tuile" href="#/conges">
            <span class="tuile-titre">Mes congés</span>
            {reste !== undefined ? (
              <span class="tuile-valeur">
                <b>{nb(reste)} j</b>
                {droits !== undefined && droits > 0 && <Jauge part={Math.max(0, Math.min(1, reste / droits))} />}
                <span class="sr-only">à poser{droits !== undefined ? ` sur ${nb(droits)}` : ''}</span>
              </span>
            ) : <span class="tuile-sous">Compteur de chaque contrat, tes absences</span>}
          </a>
          {!demo && (
            <a class="tuile" href="#/compte">
              <span class="tuile-titre">Compte</span>
              <span class="tuile-etat">{etatCompte}</span>
              {cloud.email && <span class="tuile-sous tuile-email">{cloud.email}</span>}
            </a>
          )}
          <a class="tuile" href="#/fiscal">
            <span class="tuile-titre">Impôts</span>
            <span class="tuile-sous">Abattement et revenu imposable</span>
          </a>
        </section>

        <div class="list">
          <ListLink href="#/controle" title="Contrôler un bulletin" sub="Le net, le brut, les heures déclarées" />
          <ListLink href="#/sauvegarde" title="Sauvegarde" end={<span>{joursSauvegarde === undefined ? 'jamais' : joursSauvegarde === 0 ? 'aujourd’hui' : `il y a ${joursSauvegarde} j`}</span>}
            sub={lastB ? `Dernière le ${new Date(lastB).toLocaleDateString('fr-FR')}` : 'Aucune sauvegarde pour l’instant'} />
          <ListLink href="#/reglages" title="Réglages" sub="Ton prénom, ton département, tes enfants à charge" />
          <ListLink title="Aide" onClick={() => setFeuille('aide')} />
          <ListLink href="#/pilote" title="Données du pilote" sub="Tes remarques et l’export pseudonymisé" />
          <ListLink title="Légal" onClick={() => setFeuille('legal')} />
        </div>
        <p class="footer-note">Arvela est un outil d’aide, indépendant de l’Urssaf : il ne remplace ni Pajemploi ni un conseil juridique. {cloud.email ? 'Tes données sont sur ce téléphone, avec une copie dans ton compte.' : 'Tout reste sur ce téléphone.'}</p>
      </main>
      {feuille === 'aide' && (
        <Sheet title="Aide" onClose={() => setFeuille(null)}>
          <div class="list">
            <ListLink href="#/regles" icon="help" title="Comment l’app calcule" sub="Les règles de la convention et nos choix" />
            {VIDEOS_PRETES && <ListLink href="#/guide" icon="phone" title="Vidéos" sub={`${nbVideos().total} vidéos courtes, avec le son${nbVideos().vues ? ` · ${nbVideos().vues} déjà vue${nbVideos().vues > 1 ? 's' : ''}` : ''}`} />}
            <ListLink href="#/installer" icon="phone" title="Installer sur l’iPhone" />
          </div>
        </Sheet>
      )}
      {feuille === 'legal' && (
        <Sheet title="Légal" onClose={() => setFeuille(null)}>
          <div class="list">
            <ListLink href="#/confidentialite" icon="shield" title="Confidentialité" sub="Ce qui est gardé, où, et tes droits" />
            <ListLink href="#/conditions" icon="file" title="Conditions d’utilisation" sub="Règles d’usage et contrat de traitement des données" />
            <ListLink href="#/mentions" icon="help" title="Mentions légales" sub="Éditeur, hébergeur" />
          </div>
        </Sheet>
      )}
    </>
  );
}

/** Jauge ronde : la part des congés qui reste à poser (graphique qui double le chiffre écrit). */
function Jauge({ part }: { part: number }) {
  const r = 16, L = 2 * Math.PI * r;
  return (
    <svg class="jauge" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} class="jauge-piste" />
      <circle cx="20" cy="20" r={r} class="jauge-part" style={{ strokeDasharray: `${part * L} ${L}` }} transform="rotate(-90 20 20)" />
    </svg>
  );
}
