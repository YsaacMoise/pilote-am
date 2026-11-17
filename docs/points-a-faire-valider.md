# Points à faire valider par un juriste

Volet légal d’Arvela, 4 novembre 2026. Six questions que l’éditeur ne peut pas trancher seul. Pour chacune : la question précise, l’enjeu, et le choix appliqué en attendant la réponse. Les choix sont ceux des Conditions d’utilisation, de la politique de confidentialité, du registre (docs/registre-des-traitements.md) et de l’analyse d’impact (docs/aipd.md).

Textes lus pour préparer ces questions : RGPD (articles 4, 6, 9, 13, 28, 30, 35, 36) ; pages CNIL sur l’AIPD, le registre, la mesure d’audience (4 juillet 2025) et la FAQ cookies (29 avril 2026) ; page de l’Agence du numérique en santé sur le champ de l’hébergement de données de santé. Légifrance n’a pas pu être lu directement : la numérotation de la LCEN (article 1-1) et la définition du consommateur (article liminaire du Code de la consommation) viennent de sources secondaires et sont à confirmer.

---

## 1. Qui est responsable de traitement et qui est sous-traitant

**Question.** L’assistante maternelle qui note dans Arvela les informations des enfants qu’elle accueille et de leurs parents employeurs est-elle responsable de ce traitement, Arvela n’étant que son sous-traitant ? Ou Arvela, qui conçoit l’outil, fixe les champs, les listes de soins et le contenu du lien parent, doit-il être regardé comme responsable, ou responsable conjoint (article 26) ?

**Enjeu.** Tout le reste en dépend : qui informe les parents, qui recueille leur accord pour le carnet, qui tient le registre, qui fait l’analyse d’impact, qui répond aux demandes des parents, qui déclare une violation à la CNIL. Si Arvela est responsable ou coresponsable, les parents deviennent des personnes à informer directement par Arvela (article 14) et le contrat de l’article 28 des Conditions ne suffit plus. Cas particulier : les données que l’AM note sur elle-même (ses arrêts de maladie, ses congés), rangées dans le même ensemble.

**Choix en attendant.** L’AM est responsable des données qu’elle saisit (enfants, parents, sa propre activité) ; Arvela est son sous-traitant, avec le contrat de l’article 28 dans les Conditions d’utilisation. Arvela est responsable de ses traitements propres : compte, mesure d’usage, protection anti-robots, e-mails de service, retours du test, journaux du site. Arvela aide l’AM pour ses obligations (message prêt pour les parents, registre et analyse d’impact remis sur demande).

## 2. Hébergement de données de santé (HDS)

**Question.** La copie en ligne du carnet de liaison (température, médicament donné, petits incidents), des motifs d’absence « malade » et de la case « enfant en situation de handicap ou de maladie » entre-t-elle dans le champ de l’article L1111-8 du Code de la santé publique, qui impose un hébergeur certifié pour les données de santé « recueillies à l’occasion d’activités de prévention, de diagnostic, de soins ou de suivi social et médico-social » ? L’accueil par une assistante maternelle agréée est-il un « suivi social et médico-social » au sens de ce texte ? Quel est, sur ce point, le lien avec l’article L312-1 du Code de l’action sociale et des familles (liste des établissements et services sociaux et médico-sociaux), **non lu** ?

**Enjeu.** Si la certification HDS est exigée, la base doit être hébergée par un prestataire certifié pour cette activité, avec un contrat conforme ; l’hébergement actuel (Firestore, Paris) n’a pas été vérifié sous cet angle. Héberger des données de santé sans certification expose à des sanctions.

**Choix en attendant.** HDS probablement non requis : l’AM ne réalise ni acte de soin ni suivi médico-social au sens du code de la santé publique ; les « soins » notés sont des gestes du quotidien signalés aux parents. Hébergement inchangé. La liste des soins reste fermée et l’app rappelle que le carnet ne remplace pas le registre des médicaments.

## 3. Exemption de consentement pour reCAPTCHA

**Question.** La lecture de signaux du navigateur et le dépôt d’un cookie par reCAPTCHA Enterprise, via Firebase App Check, sans consentement, sont-ils couverts par l’exemption de l’article 82 de la loi Informatique et Libertés, comme traceur strictement nécessaire à la sécurisation du service ? La FAQ cookies de la CNIL (question 17) admet l’exemption pour un CAPTCHA dont la seule finalité est la sécurité d’un mécanisme d’authentification, mais cite reCAPTCHA comme exemple d’outil dont le fournisseur peut réutiliser les données. Google agit comme sous-traitant pour reCAPTCHA depuis le 2 avril 2026 : cela suffit-il ?

**Enjeu.** Si un consentement est requis, la protection perd son sens (un robot refuserait) et la CNIL recommande alors une autre solution. App Check s’exécute aussi sur la page des parents, qui n’ont pas de compte.

**Choix en attendant.** Exemption retenue : finalité unique de sécurité, Google sous-traitant sans réutilisation selon ses conditions, clé limitée au domaine arvela.fr. Information dans la politique de confidentialité (rubriques « La protection contre les robots » et « Stockage sur l’appareil »).

## 4. Consommatrice ou professionnelle

**Question.** L’assistante maternelle, salariée de particuliers employeurs, qui utilise Arvela pour son travail, est-elle une « consommatrice » ou une « non-professionnelle » au sens de l’article liminaire du Code de la consommation ? La définition du consommateur vise la personne qui agit à des fins qui n’entrent pas dans le cadre de son activité « commerciale, industrielle, artisanale, libérale ou agricole » : l’activité salariée n’y figure pas. Et l’éditeur, particulier qui propose un service gratuit, est-il un « professionnel » ?

**Enjeu.** Si l’AM est consommatrice et l’éditeur professionnel : clauses abusives interdites (dont les limitations de responsabilité), règles de modification des conditions, médiation de la consommation, information précontractuelle. La rédaction des clauses de responsabilité et de changement en dépend.

**Choix en attendant.** Conditions rédigées pour tenir dans les deux cas : aucune exclusion générale de responsabilité, phrase « Rien dans ces conditions ne te prive des droits que la loi te garantit », changements importants annoncés avant de s’appliquer, possibilité de partir en emportant ses données. Pas de médiateur désigné.

## 5. Anonymat de l’éditeur particulier et identification exigée par le RGPD

**Question.** L’article 1-1, II de la loi pour la confiance dans l’économie numérique (ancien article 6, III, alinéa 2, déplacé par la loi du 21 mai 2024 dite SREN) permet à un éditeur non professionnel de ne publier que les coordonnées de son hébergeur, après lui avoir communiqué son identité. L’article 13 du RGPD exige de donner aux personnes « l’identité et les coordonnées du responsable du traitement ». Un responsable de traitement qui est un particulier peut-il s’identifier par un pseudonyme (« YKM ») et une adresse de contact ? Et Arvela, ouvert à toutes les assistantes maternelles et référencé, reste-t-il une publication « à titre non professionnel » ?

**Enjeu.** Une information incomplète sur l’identité du responsable est un manquement à l’article 13. Perdre le bénéfice de l’anonymat de la LCEN obligerait à publier nom, prénom et domicile. Les deux textes n’ont pas le même objet et peuvent ne pas se concilier.

**Choix en attendant.** Mentions légales et politique inchangées : « YKM, particulier, éditeur non professionnel », identité complète communiquée à l’hébergeur, contact contact@arvela.fr (redirection OVH vers la boîte de l’éditeur) ou bouton « Ça coince ». Aucun autre nom ni adresse publiés.

## 6. Exemption de consentement de la mesure d’audience pour PostHog

**Question.** La mesure d’usage par PostHog (hébergement UE), active par défaut pour les seules utilisatrices inscrites (jamais les visiteurs du site, le simulateur avant inscription ni la page des parents), avec opposition en un geste dans Réglages, peut-elle se passer de consentement au titre de l’exemption de la CNIL pour la mesure d’audience (article 82 de la loi Informatique et Libertés ; page CNIL « Cookies : solutions pour les outils de mesure d’audience » du 4 juillet 2025 ; FAQ cookies du 29 avril 2026), avec l’intérêt légitime (article 6.1.f) comme base légale ? PostHog n’a pas été évalué par la CNIL : la CNIL ne publie plus de liste d’outils évalués et renvoie à un outil d’auto-évaluation que le fournisseur remplit, et à un modèle de documentation qu’il remet à ses clients. Arvela ne dispose pas aujourd’hui de cette auto-évaluation pour PostHog.

**Enjeu.** Si l’exemption ne s’applique pas, il faut revenir à un accord préalable (le réglage de la branche principale au 4 novembre 2026). La CNIL exige que les données ne servent qu’à produire des statistiques anonymes, aucun recoupement, aucune transmission à des tiers, aucune réutilisation par le fournisseur, un traceur de 13 mois au plus sans prolongation automatique, 25 mois de conservation au plus, une information et une opposition faciles. Points sensibles : les données collectées sont **pseudonymes** (identifiant tiré au hasard), pas anonymes, et seules les statistiques qui en sortent le sont ; PostHog est un outil généraliste, qui peut faire bien plus que de la mesure d’audience si ses réglages changent ; PostHog Inc. est une société américaine ; un résumé hebdomadaire est fait par un assistant d’IA tiers (Claude, d’Anthropic, États-Unis), qui ne lit que des statistiques agrégées, jamais d’événements individuels ni d’identifiants (règle inscrite dans la tâche planifiée le 04/11/2026). Si l’analyse lisait des événements individuels sous une offre grand public d’Anthropic, la condition « pas de transmission à des tiers » ne serait pas remplie.

**Choix en attendant.** Mesure active par défaut, mise en œuvre dans la demande de fusion n° 44, avec ces réglages : utilisatrices inscrites seulement ; finalité limitée à la mesure d’audience pour le compte exclusif d’Arvela ; statistiques seulement, aucun profil de personne (`person_profiles` « never »), aucun lien avec le compte Firebase ; adresse IP non conservée et pas de géolocalisation (réglage du projet et `$geoip_disable`) ; identifiant renouvelé au plus tard tous les 13 mois sans prolongation ; événements gardés 1 an (réglage du projet PostHog ; la CNIL recommande 25 mois au plus) ; PostHog sous-traitant sans réutilisation (accord signé, entraînement d’IA refusé) ; pas de recoupement ; information dans la politique et dans Réglages ; opposition en un geste ; jamais en démonstration ; résumé par Claude limité aux statistiques agrégées. La politique de confidentialité dit que ce choix est en cours de vérification par un juriste. Demander à PostHog l’auto-évaluation CNIL ou, à défaut, la remplir à partir de sa documentation.

---

## Actions avant fusion

Ces actions ne relèvent pas du juriste, mais les textes de cette demande de fusion en dépendent.

- **Fait le 04/11/2026 : l’adresse contact@arvela.fr existe** (redirection OVHcloud vers la boîte de l’éditeur, vérifiée dans la console). Reste un message d’essai envoyé depuis une autre adresse (action YKM).
- **Fait le 04/11/2026 : les demandes n° 44 (mesure d’usage) et n° 45 (pierres tombales des liens parents) sont fusionnées.**
- **Prévoir le moyen d’envoyer l’e-mail promis 15 jours avant tout changement de prestataire** (liste des adresses tirée de la console Firebase, envoi depuis contact@arvela.fr). Aucun envoi de ce type n’existe dans le code (AIPD, mesure 13).

