import { RATES } from '../engine/rates';
import { euros } from '../engine/money';
import { shortDate } from '../engine/dates';
import { Topbar } from '../ui/kit';

const RULES: { t: string; r: string; choix?: string }[] = [
  { t: 'Salaire mensualisé (art. 109)', r: 'Année complète : heures par semaine × 52 ÷ 12. Année incomplète : heures par semaine × semaines programmées ÷ 12. Le même salaire chaque mois.' },
  { t: 'Heures en plus (art. 96 et 110)', r: 'Jusqu’à 45 h dans la semaine : au taux du contrat. Au-delà : majorées d’au moins 10 %.', choix: 'Chaque minute au-delà du planning du jour compte, même si l’enfant est parti plus tôt un autre jour (une arrivée tardive ou un départ anticipé voulus par les parents restent payés).' },
  { t: 'Retenue pour absence (art. 111)', r: 'Année complète : salaire × heures non payées ÷ heures prévues dans le mois. Année incomplète : salaire × jours non payés ÷ jours prévus dans le mois.', choix: 'Les jours fériés chômés et tes congés payés ne comptent pas dans les jours prévus. Les mois d’entrée et de sortie sont calculés de la même façon.' },
  { t: 'Enfant malade (art. 105)', r: 'Avec certificat, par année de contrat : non payé dans la limite de 5 jours d’absences courtes, et d’une absence longue de 14 jours calendaires d’affilée. Les deux limites s’ajoutent. Sans certificat ou au-delà : payé.', choix: 'Une absence de 5 jours prévus ou moins compte dans les 5 jours. Une absence plus longue utilise les 14 jours, une seule fois par année de contrat. Un férié ou un de tes congés pendant la maladie ne compte pas.' },
  { t: 'Jours fériés (art. 47)', r: '1er mai chômé et payé, payé double s’il est travaillé. Autres fériés travaillés : +10 %.', choix: 'Un férié chômé est payé si tu as travaillé le jour prévu juste avant et juste après. Tes congés, un événement familial ou une absence voulue par les parents ne comptent pas comme absence. Si tu étais malade (ou ton enfant) ces jours-là, le férié n’est pas payé. Le 1er mai chômé est toujours payé.' },
  { t: 'Congés payés (art. 48 et 102)', r: '2,5 jours ouvrables par mois d’accueil (4 semaines d’accueil valent un mois), arrondis au supérieur, 30 au plus, du 1er juin au 31 mai. Indemnité : la plus favorable entre le maintien de salaire et le dixième.', choix: 'En année incomplète, l’acquisition suit les semaines programmées. Le dixième est calculé sur les salaires nets, congés déjà versés compris. 2 jours par enfant à charge de moins de 15 ans, sans dépasser 30.' },
  { t: 'Indemnité d’entretien (art. 114.1)', r: 'Au moins 2,65 € par jour, et au moins 90 % du minimum garanti pour 9 h (soit MG ÷ 10 par heure).', choix: 'Si le contrat prévoit plus, c’est le montant du contrat qui s’applique.' },
  { t: 'Avenant', r: 'Nouvelles conditions à partir d’une date : taux, planning, entretien, repas, kilomètres, majoration, type d’année. Les jours d’avant gardent les anciennes conditions. Si le contrat était en année incomplète, une régularisation est calculée à la date de l’avenant (fiche DDETS de Haute-Garonne, 2021).', choix: 'Un avenant en cours de mois : chaque période du mois est payée au prorata de ses heures (ou jours) prévus, comme un mois d’entrée ou de sortie ; aucun texte ne fixe autrement ce calcul. Au changement de type d’année, les congés déjà acquis sont gardés et payés selon les règles en vigueur au moment du paiement.' },
  { t: 'Fin de contrat (art. 120, 121, 124)', r: 'Préavis : 8 jours avant 3 mois, 15 jours avant 1 an, 1 mois au-delà. Indemnité de rupture : 1/80e des salaires bruts dès 9 mois d’ancienneté (décès de l’enfant : même calcul et même condition ; inaptitude professionnelle : 2/80e). Régularisation si des heures accueillies n’ont pas été payées.', choix: 'Préavis compté à partir du jour de l’annonce. Ancienneté de 9 mois appréciée le jour de l’envoi de la lettre. Quand le brut d’un mois n’est pas connu, il est estimé à partir du net. Rien n’est payé deux fois : les congés déjà versés sont déduits.' },
  { t: 'Contrôle du brut', r: 'Le net d’une assistante maternelle représente environ 78 % du brut.', choix: 'Un écart au-delà de 74–82 % est signalé.' },
  { t: 'Impôts (CGI art. 80 sexies)', r: '3 SMIC horaires par jour d’accueil et par enfant (4 en cas de handicap ou maladie), au prorata sous 8 h, plafonné aux sommes reçues.', choix: 'SMIC du 1er janvier de l’année des revenus. Les frais kilométriques ne sont pas comptés.' },
];

export function Regles() {
  return (
    <>
      <Topbar title="Comment l’app calcule" back="#/plus" screen="regles" />
      <main>
        <p>Les calculs suivent la convention collective des particuliers employeurs et de l’emploi à domicile (IDCC 3239). Quand une règle laisse un doute, l’app choisit l’interprétation qui ne te fait pas perdre d’argent, et le dit.</p>
        {RULES.map((x) => (
          <section class="card stack-sm">
            <h2 style={{ fontSize: '19px' }}>{x.t}</h2>
            <p>{x.r}</p>
            {x.choix && <p class="muted small"><b>Notre choix :</b> {x.choix}</p>}
          </section>
        ))}
        <section class="card stack-sm" aria-labelledby="taux">
          <h2 id="taux" style={{ fontSize: '19px' }}>Taux utilisés</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '15px' }}>
              <thead><tr style={{ textAlign: 'left' }}><th scope="col">Depuis le</th><th scope="col">SMIC</th><th scope="col">MG</th><th scope="col">Min. AM brut</th></tr></thead>
              <tbody>
                {RATES.map((r) => (
                  <tr style={{ borderTop: '1px solid var(--line)' }}><td>{shortDate(r.from)}</td><td class="num">{euros(r.smic)}</td><td class="num">{euros(r.mg)}</td><td class="num">{euros(r.minConvBrut)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p class="hint">Une revalorisation = une ligne ajoutée. Les calculs d’un mois utilisent les taux en vigueur ce mois-là.</p>
        </section>
        <p class="footer-note">L’app ne remplace pas Pajemploi, ni le relais petite enfance, ni un conseil juridique.</p>
      </main>
    </>
  );
}
