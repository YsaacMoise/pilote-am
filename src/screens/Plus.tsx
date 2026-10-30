import { useStore } from '../store';
import { isDemo } from '../db';
import { statusText, useCloud } from '../cloud-state';
import { today, shortDate } from '../engine/dates';
import { Gommette, ListLink, Topbar } from '../ui/kit';
import { Icon } from '../ui/icons';

export function Plus() {
  const s = useStore();
  const cloud = useCloud();
  const demo = isDemo();
  const t = today();
  const lastB = s.settings.lastBackup;
  return (
    <>
      <Topbar title="Plus" screen="plus" />
      <main>
        <section class="stack-sm" aria-labelledby="enf">
          <h2 id="enf" class="section-title">Les enfants</h2>
          <div class="list">
            {s.contracts.map((c) => (
              <ListLink
                href={`#/contrat/${c.id}`}
                icon={<Gommette name={c.child} color={c.color} />}
                title={c.child}
                sub={`${c.family ? c.family + ', ' : ''}${c.end && c.end < t ? `terminé le ${shortDate(c.end)}` : `depuis le ${shortDate(c.start)}`}`}
              />
            ))}
            <a class="li" href="#/contrat/nouveau">
              <span class="li-ico"><Icon name="plus" /></span>
              <span class="li-main"><span class="li-title">Ajouter un enfant</span></span>
            </a>
          </div>
        </section>
        <section class="stack-sm" aria-labelledby="argent">
          <h2 id="argent" class="section-title">Paie et droits</h2>
          <div class="list">
            <ListLink href="#/conges" icon="sun" title="Congés payés et absences" sub="Compteur, indemnité, tes absences" />
            <ListLink href="#/controle" icon="receipt" title="Contrôler un bulletin" sub="Le net, le brut, les heures déclarées" />
            <ListLink href="#/fin" icon="door" title="Fin de contrat" sub="Préavis, indemnités, régularisation" />
            <ListLink href="#/fiscal" icon="chart" title="Impôts" sub="Abattement et revenu imposable estimé" />
          </div>
        </section>
        <section class="stack-sm" aria-labelledby="donnees">
          <h2 id="donnees" class="section-title">Mes données</h2>
          <div class="list">
            {!demo && <ListLink href="#/compte" icon="cloud" title="Compte" sub={cloud.email ? `${cloud.email} · ${statusText(cloud)}` : statusText(cloud)} />}
            <ListLink href="#/sauvegarde" icon="shield" title="Sauvegarde" sub={lastB ? `Dernière le ${new Date(lastB).toLocaleDateString('fr-FR')}` : 'Aucune sauvegarde pour l’instant'} />
            <ListLink href="#/pilote" icon="message" title="Données du pilote" sub="Tes remarques et l’export anonymisé" />
            <ListLink href="#/reglages" icon="settings" title="Réglages" sub="Ton prénom, tes enfants à charge" />
          </div>
        </section>
        <section class="stack-sm" aria-labelledby="aide">
          <h2 id="aide" class="section-title">Aide</h2>
          <div class="list">
            <ListLink href="#/regles" icon="help" title="Comment l’app calcule" sub="Les règles de la convention et nos choix" />
            <ListLink href="#/installer" icon="phone" title="Installer sur l’iPhone" />
          </div>
        </section>
        <p class="footer-note">Arvela ne remplace ni Pajemploi ni un conseil juridique. {cloud.email ? 'Tes données sont sur ce téléphone, avec une copie dans ton compte.' : 'Tout reste sur ce téléphone.'}</p>
      </main>
    </>
  );
}
