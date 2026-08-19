# BSE push up

Compteur de pompes par vision par ordinateur (MediaPipe), avec suivi de
progression, graphiques et classement de groupe. Concu pour un petit
groupe ferme (une dizaine de personnes), pas pour un usage grand public.

L'application est volontairement limitee aux pompes pour l'instant (voir
"Parcours reduit aux pompes") ; le moteur multi-exercices, le ciblage
musculaire 3D et le generateur de seance sont deja en place pour la
suite.

## Parcours utilisateur

`gate` (pseudo, puis code PIN ; mot de passe de groupe desactive
temporairement, voir `PASSCODE_ENABLED` dans `src/ui/screens/gate.js`) ->
`home` (stats, historique, gestion du compte) -> `tutorial` (demonstration
3D animee des pompes) -> `session` (comptage a la camera, enregistrement
video, flash plein ecran a chaque repetition validee, chrono, bascule
camera avant/arriere) -> recapitulatif de fin de seance -> retour a `home`.

Le classement mene au profil detaille de chaque membre (`profile`) :
seances, durees, videos, et bouton de signalement. Le compte `Admin` a en
plus l'ecran `admin`, ou les signalements sont tranches.

## Parcours reduit aux pompes

L'application ne propose volontairement que les pompes pour l'instant :
tant que la fiabilite du comptage n'est pas validee en conditions
reelles, ajouter des exercices reviendrait a multiplier les sources
d'erreur. La seance est libre (une seule serie, aucun objectif chiffre,
arret par le bouton "Terminer") : c'est le comptage qu'on observe, pas
l'atteinte d'un objectif.

Tout le reste est conserve et simplement hors du parcours par defaut :

- les autres exercices (`squat.js`, `lunge.js`, `plank.js`) et le
  generateur de seance (`src/workout/generator.js`) sont intacts
- l'ecran de ciblage 3D reste accessible depuis l'accueil ("Voir le corps
  3D") en mode visionneuse : on peut faire pivoter le corps et allumer
  des muscles, mais la selection ne genere pas de seance
- pour revenir au parcours complet : dans `src/ui/screens/home.js`,
  faire pointer le bouton principal sur `targeting` (avec
  `ctx.setMuscleSelection([])`) au lieu de `createPushupSessionPlan()` +
  `tutorial`

Le plan d'une seance de pompes est decrit dans
`src/workout/pushupSession.js`. Un bloc dont `targetReps` (ou
`targetHoldSeconds`) vaut `null` est une seance libre : `session.js`
n'affiche alors ni numero de serie ni objectif, et ne s'arrete jamais
tout seul.

Le document de conception de la refonte v4 (tutoriels 3D, dashboard avance
avec carte de fatigue musculaire, generateur a progression continue,
durcissement du moteur de pose) est dans `docs/TDD-v4.md`.

## Architecture

- **Build** : Vite (modules ES natifs, dev server rapide)
- **Interface** : JavaScript vanilla, sans framework
- **Vision par ordinateur** : `@mediapipe/tasks-vision` (`PoseLandmarker`),
  l'API MediaPipe actuellement maintenue par Google. Le moteur est
  multi-exercices : voir "Moteur multi-exercices" ci-dessous
- **Ciblage 3D** : Three.js, maillage anatomique reel au rendu hologramme
  (voir "Corps 3D")
- **Generation de seance** : algorithme deterministe base sur des regles
  (pas de machine learning), voir "Generation de seance"
- **Voix** : coach vocal **suspendu pour le moment** (desactive par defaut
  dans `src/audio/coach.js`, priorite a la fiabilite du comptage). Le code
  reste en place (Web Speech API, aucun service tiers) pour une
  reactivation future
- **Backend** : Supabase (Postgres). Les tables de donnees
  (`utilisateurs`, `historique`, `signalements`) restent en
  lecture/ecriture ouvertes ; ce qui doit etre protege (code PIN d'un
  compte, decisions d'administration) passe par des fonctions
  `security definer` verifiees par la base. Voir "Comptes et codes PIN"
- **Videos de seance** : Supabase Storage (bucket `seances`), une video par
  seance enregistree depuis le canvas. Voir "Verification des performances"
- **PWA** : `vite-plugin-pwa` (manifest deja fourni dans `public/`, service
  worker genere automatiquement au build)

```
src/
  core/
    exercises/    moteur multi-exercices (angleRepCounter, holdTimer,
                  exerciseEngine, definitions pompes/squats/fentes/planche)
    rig/          rig anime pour les tutoriels 3D (buildRig, animationClips,
                  animateRig) - voir "Tutoriels animes"
    geometry.js, landmarks.js, poseEngine.js, cameraStream.js, date.js,
    withTimeout.js, sessionRecorder.js (video de seance)
  biomechanics/   taxonomie des muscles + regles d'equilibre (antagonistes)
  workout/        generateur de seance + agregations de progression
                  (totaux quotidiens, par exercice, record, streak)
  audio/          coach vocal (file d'attente, anti-spam, transitions)
  lib/            client Supabase
  social/         trash talk : piques choisies selon la position au
                  classement (module pur, teste)
  auth/           gestion locale du pseudo + verification du mot de passe
  db/             acces Supabase : historique/classement, comptes et codes
                  PIN (comptes.js), signalements, videos (Storage)
  ui/
    threeBody/    corps 3D (Three.js) : loadAnatomyModel.js charge le
                  maillage anatomique, buildBody.js pose les volumes de
                  detection par muscle, hologramMaterial.js est le shader
                  hologramme partage entre le ciblage et les tutoriels
    charts/       graphiques SVG maison (courbe, barres), sans dependance
    screens/      gate, home, targeting, tutorial, workoutSetup, session,
                  progress, leaderboard, profile, admin
supabase/migrations/   0001_init.sql (schema), 0002_duree_seances.sql,
                  0003_comptes_signalements_videos.sql
public/       manifest PWA, icones, models/ (corps 3D glTF + animation FBX)
docs/TDD-v4.md   document de conception de la refonte v4
```

## Moteur multi-exercices

Le moteur ne connait aucune logique specifique a un exercice : chaque
exercice (`src/core/exercises/pushup.js`, `squat.js`, `lunge.js`,
`plank.js`) declare ses propres points de repere (`points`), son calcul de
metriques (`computeMetrics`), sa machine a etats (`createState`) et ses
messages. Le moteur generique (`exerciseEngine.js`) applique cette
definition aux landmarks detectes a chaque frame ; changer d'exercice en
cours de seance revient simplement a instancier un nouveau moteur avec une
autre definition (`session.js` le fait a chaque nouvelle serie).

Deux machines a etats reutilisables :

- `angleRepCounter.js` : exercices en repetitions, pilotes par un angle
  articulaire principal (coude, genou) et un controle de forme optionnel.
  Utilisee par pompes, squats, fentes.
- `holdTimer.js` : exercices en maintien (planche), mesure le temps cumule
  en bonne forme.

## Generation de seance

`src/workout/generator.js` prend la selection musculaire, le temps
disponible et un niveau (`debutant`/`intermediaire`/`avance`, estime a
partir de la moyenne des reps des 5 dernieres seances enregistrees). Le
temps est reparti a parts egales entre les exercices retenus, puis
converti en repetitions (ou secondes de maintien) par serie : moins de
temps donne moins de repetitions et/ou moins de series, plus de temps en
donne davantage, dans des bornes realistes (`MIN_REPS`/`MAX_REPS`,
`MIN_HOLD_SECONDS`/`MAX_HOLD_SECONDS`, `MAX_SETS`). Regles fixes, pas
d'apprentissage automatique. Aucune pause n'est comptee entre les series,
qui s'enchainent directement.

Limite assumee : avec un seul exercice choisi et un temps tres long, la
charge par serie et le nombre de series plafonnent (au-dela, ce serait
un volume d'entrainement deraisonnable pour un seul mouvement) ; le champ
`estimatedMinutes` du plan reflete alors honnetement un temps reel
inferieur au temps demande plutot que de gonfler artificiellement les
chiffres.

`src/biomechanics/balanceRules.js` verifie, pour chaque muscle
selectionne, si l'un de ses antagonistes declares (`muscleGroups.js`) est
absent de la selection, et le cas echeant previent d'un risque de
desequilibre et suggere de l'ajouter.

## Tutoriels animes

Avant la camera, `src/ui/screens/tutorial.js` affiche une demonstration 3D
du mouvement, avec la meme identite visuelle que le ciblage (hologramme,
bloom, rotation libre a la souris/au doigt).

La demonstration des pompes est une vraie capture de mouvement :
`public/models/pushup_animation/pushup.glb` (personnage Mixamo, squelette
de 52 os), chargee a la demande par
`src/ui/threeBody/loadPushupAnimation.js` et jouee par un
`AnimationMixer`.

### Pourquoi un .glb et pas le .fbx d'origine

L'export Mixamo embarque les textures du personnage, qui representent
l'essentiel du poids du fichier (33 Mo) alors que le rendu hologramme les
remplace de toute facon. `scripts/fbx-to-glb.mjs` les supprime et
reexporte en glTF binaire :

```bash
node scripts/fbx-to-glb.mjs source.fbx public/models/pushup_animation/pushup.glb
```

Resultat : 4,7 Mo au lieu de 33 Mo, charge par le meme `GLTFLoader` que le
corps anatomique, sans embarquer `FBXLoader` dans le bundle. Le FBX source
n'est plus dans le depot (il reste dans l'historique git) : seul le .glb
est deploye. La meme commande sert pour toute animation ajoutee plus tard.

Deux details du format Mixamo sont traites explicitement :

- l'export contient un clip technique vide (`Take 001`) en plus du
  mouvement (`mixamo.com`) : la conversion comme le lecteur ne retiennent
  que les clips qui contiennent reellement des pistes, sinon le
  personnage resterait fige
- le fichier est fourni en T-pose debout alors que l'animation se deroule
  au sol : la mise a l'echelle se fait sur la plus grande dimension (et
  non sur la hauteur), et le cadrage vise un sujet allonge pres du sol,
  avec un recul calcule d'apres la forme de l'ecran pour qu'un telephone
  en portrait ne coupe pas les extremites du corps

### Rendu d'un maillage deforme par un squelette

Le shader hologramme ecrit a la main convient aux maillages statiques,
mais laissait le personnage fige dans sa pose de repos : la deformation
par les os n'etait pas appliquee. `createSkinnedHologramMaterial()`
(`hologramMaterial.js`) part donc d'un materiau integre a Three.js, dont
le shader de sommets gere le squelette de maniere certaine, et n'injecte
que l'aspect hologramme dans le shader de fragments. L'eclairage calcule
par ce materiau est entierement remplace : la scene n'a besoin d'aucune
lumiere, comme pour les maillages statiques.

Le pantin en primitives (`src/core/rig/`, anime par
`animationClips.js` / `animateRig.js`) reste en place comme repli : il
s'affiche immediatement pendant le telechargement du personnage, et
persiste si celui-ci echoue. L'ecran affiche l'avancement du
telechargement puis, en cas d'echec, le message d'erreur exact : sans
cela, un chargement long, un echec reseau et une animation qui ne joue pas
sont impossibles a distinguer a l'oeil. Les autres exercices n'ont pas encore de
demonstration ; si un exercice n'en a aucune, l'ecran est saute
automatiquement et la seance demarre directement.

## Progression

Nouvel onglet "Progression" (entre Accueil et Classement) montrant, sur
les 30 derniers jours :

- une courbe des repetitions par jour (`src/ui/charts/lineChart.js`)
- une repartition par exercice en barres horizontales
  (`src/ui/charts/barChart.js`)
- trois indicateurs : total sur la periode, record de seance (plus haut
  nombre de repetitions/secondes sur une seule ligne d'historique), jours
  consecutifs avec au moins une seance

Les graphiques sont du SVG genere a la main (`src/ui/charts/`), sans
bibliotheque graphique externe, pour rester coherent avec le reste de
l'architecture vanilla et ne pas alourdir le bundle. Les agregations
(`src/workout/progressStats.js`) sont des fonctions pures, testables
independamment de Supabase. La requete (`fetchUserSessionsRange` dans
`src/db/historique.js`) est protegee par le meme garde-fou `withTimeout`
que le reste de l'application.

## Comptes et codes PIN

Le groupe compte une dizaine de personnes maximum : une authentification
par email (inscription, confirmation, mot de passe oublie) serait une
charge inutile. Il n'y a donc toujours ni email ni mot de passe complet,
mais un pseudo ne suffisait plus : n'importe qui pouvait entrer sous le
pseudo d'un autre et gonfler son score. Depuis la migration 0003 :

- a la **creation** d'un pseudo, l'application demande un code de 4 a 6
  chiffres, saisi deux fois
- aux **connexions suivantes**, le code est redemande
- le code est **hache par la base** (`crypt` / `gen_salt('bf')`, pgcrypto)
  et stocke dans `codes_acces`, table sans aucune policy RLS : le client ne
  peut ni la lire ni l'ecrire. Les seuls acces sont les fonctions
  `security definer` `definir_code_pin`, `verifier_code_pin`,
  `modifier_code_pin`. Le hash ne sort jamais de la base
- un compte cree avant cette migration n'a pas de code : la premiere
  personne qui entre sous ce pseudo se voit proposer d'en poser un

Un membre peut **changer son code** ou **supprimer son compte** depuis
l'accueil. La suppression demande le code et la ressaisie du pseudo, puis
efface le compte, tout son historique (cascade) et ses videos. C'est la
reponse aux fautes de frappe et aux comptes crees par erreur.

Un compte **sans code** n'est supprimable sans justificatif que s'il n'a
**aucune seance** : c'est exactement le cas du pseudo mal orthographie. Des
qu'il a un historique, il faut son code ou celui de l'administrateur.
L'application cree en effet des comptes sans code chaque fois que la base
est injoignable pendant une seance ; sans cette regle, il aurait suffi de
lister les comptes sans code pour effacer leur historique.

### Essais limites

Un code a 4 chiffres, c'est 10 000 combinaisons : sans limite d'essais, le
deviner est l'affaire de quelques secondes pour un script. La migration
0004 ajoute donc un compteur d'echecs (`codes_acces.echecs`) et un blocage
de 15 minutes au bout de 5 essais errones, ce qui ramene une enumeration
complete a plusieurs jours d'attente. Un code juste remet le compteur a
zero, pour qu'une faute de frappe de temps en temps ne bloque personne.

Toutes les verifications passent par une seule fonction interne
(`verifier_code_interne`), y compris celle du code administrateur. C'est
volontaire : tant que la moindre fonction comparait un code sans compter
l'essai, elle servait d'oracle et le blocage ne servait a rien.

### Administrateur

Le compte de moderation est le pseudo **`Admin`**, code **`2424`** a
l'installation (cree par la migration 0003 ; a changer depuis
l'application, "Changer mon code"). Il est marque `est_admin` en base.

Ce que ce compte peut faire — trancher un signalement, supprimer une
seance, supprimer un compte — n'est pas garde par l'interface mais par la
base : chaque operation renvoie le code administrateur a une fonction
`security definer` qui le verifie (`est_code_admin`). Forcer l'affichage de
l'ecran d'administration depuis la console ne donne donc que des refus. Le
code n'est jamais stocke sur l'appareil : il est demande a chaque visite de
l'ecran, garde en memoire vive, et oublie au rechargement.

### Ce qui reste ouvert, deliberement

Les tables `utilisateurs`, `historique` et `signalements` restent en
lecture/ecriture ouvertes (policies RLS `using (true)`), pour que le
classement reste simple et instantane. La cle publique Supabase
(`anon key`) est de toute facon visible dans le code cote client, comme
pour toute application front-end statique. Concretement : un membre
determine peut toujours inserter une seance bidon en tapant directement
dans l'API. Ce qu'il ne peut pas faire, c'est entrer sous le pseudo d'un
autre ni s'auto-innocenter d'un signalement. C'est le niveau de confiance
attendu dans un groupe d'amis ; si le lien fuite ou si le groupe grandit,
il faudra passer les ecritures elles aussi par des fonctions verifiees.

## Verification des performances

Un compteur automatique se trompe, et un ami peut tricher (pompes a moitie
descendues, telephone secoue). Trois briques repondent a ca.

**Le profil detaille.** Le classement est cliquable : chaque pseudo ouvre
`src/ui/screens/profile.js`, qui affiche les totaux, le temps total, la
moyenne par seance, puis la liste des seances avec pour chacune la date, le
nombre de repetitions, la duree et la cadence (repetitions par minute) — une
cadence aberrante est deja un indice.

**La video.** Pendant la seance, `src/core/sessionRecorder.js` enregistre le
**canvas**, pas le flux camera brut : la video montre donc a la fois la
personne et le squelette detecte, c'est-a-dire ce que le compteur a
reellement suivi. Reglages volontairement modestes (15 images/s, 800 kbit/s)
pour qu'une seance reste de l'ordre de quelques megaoctets et parte depuis un
telephone en 4G. La video est deposee dans le bucket Storage `seances` avant
l'insertion de la seance, pour que son chemin parte avec la ligne : la table
`historique` n'accepte que des insertions, jamais de mise a jour. Un echec
d'envoi ne fait jamais perdre le score : la seance est enregistree sans
video.

**Les signalements.** Depuis le profil d'un autre membre, "Signaler" permet
de demander un **recalcul** (en proposant un autre nombre de repetitions) ou
une **annulation**, avec un motif. Le signalement part dans la table
`signalements` et apparait sur l'ecran Administration. L'administrateur voit
la seance, la video, la demande, puis accepte ou refuse :

- recalcul accepte : `repetitions` est remplace, l'ancienne valeur est
  conservee dans `repetitions_initiales` (le profil affiche alors
  "Recalculee")
- annulation acceptee : `annulee` passe a vrai. La seance disparait du
  classement et des statistiques mais reste en base, comme trace de la
  decision

## Trash talk

`src/social/trashTalk.js` affiche une pique selon la position au
classement : sur l'accueil (sur la journee), sur le classement (selon
l'onglet) et au recapitulatif de fin de seance (selon la seance, avec une
ligne speciale quand un record tombe).

Le module est **pur** : il recoit un classement deja charge et rend une
phrase, sans DOM ni reseau. C'est ce qui permet de le tester
(`test/trashTalk.test.mjs`) sans navigateur. Les tests ne portent pas sur
le texte des piques, qui changera, mais sur le classement des situations
(`domination`, `menace`, `leader`, `proche`, `distance`, `largue`,
`dernier`, `zero`, `aucun`) : afficher une phrase de vainqueur a quelqu'un
qui est dernier serait ridicule. Les seuils sont deux constantes en haut du
fichier (`ECART_SERRE`, `ECART_LARGE`).

Le ton est celui d'un groupe d'amis qui se chambre : ca tape fort, mais ca
ne vise que la flemme et les scores. Pour l'adoucir ou le durcir, il suffit
de reecrire le catalogue `LIGNES` ; la structure ne bouge pas.

## Mise en place de Supabase

1. Creer un projet gratuit sur supabase.com.
2. Ouvrir l'editeur SQL du projet et executer, dans l'ordre, chaque fichier
   de `supabase/migrations/` (`0001_init.sql`, `0002_duree_seances.sql`,
   `0003_comptes_signalements_videos.sql`, puis
   `0004_anti_force_brute.sql`). La migration 0003 cree
   aussi le bucket Storage `seances` ; si votre projet refuse d'ecrire dans
   le schema `storage`, creez-le a la main (Storage > New bucket > nom
   `seances`, case "Public bucket" cochee).
3. Dans Project Settings > API, recuperer l'URL du projet et la cle
   publique (`anon public key`).

## Configuration locale

```bash
cp .env.example .env
# renseigner VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY et VITE_GROUP_PASSCODE dans .env
npm install
npm run dev
```

Sans `.env` renseigne, l'application demarre quand meme (ecran d'acces
affiche un avertissement) mais aucune donnee ne peut etre lue ou
enregistree.

## Scripts

- `npm run dev` : serveur de developpement
- `npm run build` : build de production dans `dist/`
- `npm run preview` : sert le build de production localement
- `npm test` : tests du compteur de repetitions (`test/`, lanceur integre a
  Node, aucune dependance)

Les tests couvrent le coeur du comptage en lui injectant des angles : series
propres, bruit de detection, immobilite au niveau d'un seuil, dos creuse,
demi-pompes, cadences de 2 s a 0,5 s par repetition, et perte de suivi.
C'est la ou se logeaient les bugs constates en conditions reelles.

## Tester sur iPhone

Safari bloque l'acces camera hors contexte securise (HTTPS ou localhost).
Options rapides :

- tunnel HTTPS temporaire (`npx localtunnel --port 5173` ou `ngrok http
  5173` pendant `npm run dev`)
- deploiement statique (Vercel, Netlify, GitHub Pages) en pointant vers
  `npm run build`, avec les variables d'environnement `VITE_SUPABASE_URL`
  et `VITE_SUPABASE_ANON_KEY` renseignees sur la plateforme d'hebergement

Une fois deploye, ouvrir l'URL dans Safari puis Partager > Sur l'ecran
d'accueil pour une installation en PWA sans barre d'adresse.

## Reglages des exercices

Chaque fichier `src/core/exercises/*.js` centralise ses propres seuils
(`downAngle`/`upAngle` pour les exercices en repetitions, angle
d'alignement dans `computeMetrics`). Le nombre de series de base par
niveau et les bornes de charge par serie sont dans
`src/workout/generator.js` (`BASE_SETS_BY_LEVEL`, `MIN_REPS`/`MAX_REPS`,
`MIN_HOLD_SECONDS`/`MAX_HOLD_SECONDS`).

Chaque definition separe les points indispensables au comptage
(`corePointKeys`, ex. epaule-coude-poignet pour les pompes) des points
utilises uniquement pour le controle de forme (`formPointKeys`, ex.
hanche-cheville pour l'alignement). Si les points de forme ne sont pas
assez visibles (chevilles hors cadre, frequent selon l'angle de camera),
le controle de forme est simplement ignore pour cette frame plutot que
de bloquer tout le comptage : mieux vaut valider une repetition sans
verifier la forme que ne jamais la valider a cause d'un pied hors champ.
La selection du cote (gauche/droit) le plus visible utilise aussi une
hysteresis (`pickSideGeneric` dans `src/core/landmarks.js`) : en cas
d'ambiguite proche, le cote choisi la frame precedente est conserve
plutot que recalcule independamment, pour eviter que l'angle mesure ne
saute de maniere erratique.

La machine a etats des exercices en repetitions
(`src/core/exercises/angleRepCounter.js`) est durcie contre le bruit de
detection :

- **lissage exponentiel** (EMA, `smoothing` 0.45) de l'angle principal :
  une frame aberrante ne peut plus creer ni faire perdre une repetition
- **anti-rebond** (`confirmFrames` 2) : un changement d'etat haut/bas doit
  etre confirme sur plusieurs frames consecutives, ce qui supprime les
  repetitions fantomes quand l'angle oscille autour d'un seuil
- **controle de forme non bloquant** : "Gaine ton bassin" est un simple
  avertissement, la repetition est comptee quand meme
- les seuils des pompes sont assouplis (100/150 au lieu de 90/160) : de
  profil, les angles extremes sont rarement mesures par le modele

Quand une descente n'est pas assez basse, la repetition n'est pas comptee
mais l'ecran le dit ("Pas assez bas, non comptee") au lieu de rester
muet. Le bouton "Debug" de l'ecran de seance affiche l'angle mesure,
l'angle lisse, les seuils en vigueur et l'amplitude reellement atteinte a
la derniere repetition validee : c'est ce qui permet de savoir si une
repetition manquee vient du mouvement ou d'un seuil mal regle, et de
regler `thresholds` dans `src/core/exercises/pushup.js` en consequence.

Le lissage introduit un retard volontaire de une a deux frames (~60 ms a
30 images/seconde). En simulation, le comptage reste exact de 2 s par
pompe jusqu'a 0,5 s par pompe ; il ne decroche qu'au-dela de 3 pompes par
seconde, cadence hors de portee humaine. Augmenter `smoothing` (vers 1)
reduit ce retard mais laisse repasser le bruit ; le baisser lisse
davantage au prix de la reactivite.

## Mode degrade quand la base est injoignable

Le plan gratuit Supabase met en pause les projets inactifs, et le reveil
laisse quelques instants pendant lesquels PostgREST ne connait pas encore
les tables. L'application ne doit pas devenir inutilisable pour autant :
compter des pompes ne depend pas de la base, seul l'enregistrement en
depend.

`src/db/errors.js` distingue donc deux familles d'echec :

- `HistoriqueUnavailableError` : base momentanement absente (aucune
  reponse, reponse d'une passerelle sans code d'erreur exploitable, ou
  code `PGRST205` du cache de schema encore froid). L'ecran d'entree
  laisse alors entrer malgre tout, et les ecrans de donnees affichent
  "Donnees indisponibles : base hors ligne".
- `HistoriqueError` : la base a bien repondu et a refuse la requete
  (colonne absente, contrainte violee...). Le message exact est affiche,
  car il y a quelque chose a corriger.

Le recapitulatif de fin de seance distingue les deux cas : "Base hors
ligne : seance non enregistree" (reessayer plus tard) ou "Enregistrement
refuse : ..." (corriger la base, typiquement une migration oubliee).

Deux consequences pour les ajouts de la migration 0003 :

- **codes PIN** : si la base est injoignable, ou si la migration 0003 n'a
  pas ete executee (`PGRST202`, fonction inconnue), l'ecran d'entree
  n'exige aucun code et laisse entrer au pseudo seul, comme avant. Une
  panne de reseau ne doit pas empecher de compter des pompes.
- **videos et signalements** : les colonnes et la table manquantes sont
  detectees a la premiere requete (`src/db/execute.js`,
  `isMissingColumn` / `isMissingFunction`), la requete est rejouee sans
  elles, et les ecrans masquent simplement ce qui n'existe pas. Meme
  mecanisme que pour `duree_secondes` en 0002.

## Corps 3D

L'ecran de ciblage affiche un maillage anatomique reel, place dans
`public/models/male_anatomy/` (glTF + binaire, ~8,5 Mo) et charge a la
demande par `src/ui/threeBody/loadAnatomyModel.js`. Le materiau d'origine
est remplace par le shader hologramme partage
(`hologramMaterial.js`), pour garder la meme identite visuelle que le
reste des ecrans 3D. Le modele est mis a l'echelle automatiquement
(mesure de sa boite englobante) : aucune valeur propre a ce fichier n'est
codee en dur, un autre modele se substituerait sans retouche.

Ce maillage etant monobloc (un seul materiau, aucun decoupage par
muscle), il ne peut pas servir de cible de clic par muscle. Les
primitives de `buildBody.js` restent donc en place dans ce role :
invisibles au repos (`colorWrite` desactive, mais toujours cliquables),
elles deviennent la surbrillance pulsante du muscle une fois selectionne.
Si le chargement echoue, elles redeviennent visibles pour que le ciblage
reste utilisable.

Le fichier est trop volumineux pour le precache du service worker ; il
est mis en cache a la premiere visite de l'ecran (`runtimeCaching`, voir
`vite.config.js`).

Credit requis par la licence, affiche dans l'application et repris ici :
ce travail est base sur "Male anatomy figure"
(https://sketchfab.com/3d-models/male-anatomy-figure-e39449c8c59346788834b94706faf4bb)
par C.J..Goldman (https://sketchfab.com/C.J..Goldman), sous licence
CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/).

## Duree des seances

Tant que la migration `0002` n'a pas ete appliquee, la colonne
`duree_secondes` n'existe pas et la base refuse aussi bien l'ecriture que
la lecture qui la mentionnent. Plutot que de perdre la seance,
`src/db/historique.js` detecte ce cas precis (codes `42703` / `PGRST204`
mentionnant la colonne) et rejoue la requete sans la duree, en le signalant
dans la console. La duree est enregistree des que la migration est passee,
sans changement de code.

La duree passee sur chaque exercice est enregistree en base
(`historique.duree_secondes`, migration `0002_duree_seances.sql`) ; la
somme des lignes d'une seance redonne la duree totale. Un chrono est
affiche pendant la seance, et un ecran recapitulatif (repetitions totales,
duree, statut d'enregistrement) s'affiche a la fin avant le retour a
l'accueil.

## Coach vocal (suspendu)

Suspendu pour le moment : `enabled` est a `false` par defaut dans
`src/audio/coach.js` et le bouton "Son" a ete retire de l'ecran de seance.
Pour le reactiver, repasser le defaut a `supported` et remettre le bouton.
Le fonctionnement decrit ci-dessous reste valable une fois reactive.

`src/audio/coach.js` gere une file d'attente courte (3 messages maximum),
un anti-spam par cooldown independant pour chaque type d'alerte (5
secondes), et des encouragements declenches uniquement pendant les temps
morts (file vide, pas de parole en cours), toutes les 20 secondes au plus.
Un bouton "Son" dans l'ecran de seance permet de la couper a tout moment.
Les transitions de seance (debut d'exercice, exercice suivant, fin de
seance) coupent la parole en cours : ce sont des changements de contexte
nets qui doivent passer avant le reste. Le coach vocal ne leve jamais
d'exception vers son appelant (voir `src/audio/coach.js`) : meme si la
Web Speech API se comporte mal (frequent sur Safari iOS), la progression
de la seance (serie suivante) n'en depend jamais.

A chaque repetition validee, un flash plein ecran (vert, ~380 ms, via
l'API Web Animations) s'ajoute au changement de couleur du bandeau de
message.

## Camera

Le canvas utilise `object-fit: contain` (jamais `cover`) : l'image
complete de la camera est toujours visible, quitte a avoir des bandes
noires plutot que de rogner une partie du corps. Un bouton "Retourner
camera" dans l'ecran de seance bascule entre camera frontale et
arriere ; le miroir (effet selfie) ne s'applique qu'en frontale. Le
champ de vision d'une camera de telephone est fixe par l'objectif : au-
dela de ce que permet `contain`, changer d'objectif (avant/arriere) est
le seul levier logiciel restant pour un cadrage plus large.

## Limites connues

- **Mot de passe de groupe desactive temporairement** : l'ecran d'acces ne
  demande plus que le pseudo (`PASSCODE_ENABLED = false` dans
  `src/ui/screens/gate.js`). A remettre a `true` pour retablir le filtre.
- **Corps 3D anatomique mais monobloc** : le maillage affiche est un vrai
  modele anatomique (voir "Corps 3D"), mais il n'est pas decoupe par
  muscle. La selection passe donc par des volumes de detection approches
  (capsules/boites de `buildBody.js`) poses par-dessus : les zones
  cliquables ne suivent pas exactement les contours des muscles du
  maillage. Un maillage reellement segmente par muscle se brancherait au
  meme endroit sans changer le reste de l'architecture, qui ne depend que
  de `mesh.userData.muscleId`.
- **Fentes simplifiees** : suivent l'angle du genou avant comme un squat,
  sans distinguer jambe avant/arriere ni largeur de fente.
- **Tutoriel 3D anime uniquement pour les pompes** : `animationClips.js` ne
  contient qu'un clip. Pour squat/fente/planche, l'ecran de tutoriel est
  automatiquement saute (voir "Tutoriels animes") ; ajouter leur clip est
  la meme demarche (donnees seulement, le lecteur ne change pas).
- **Certains muscles n'ont aucun exercice associe** : dos, biceps et
  mollets sont proposes au ciblage 3D et dans les suggestions
  d'equilibre biomecanique, mais aucun des 4 exercices actuels
  (`src/core/exercises/`) ne les travaille. Les selectionner seuls ne
  genere aucun bloc exploitable (le generateur retombe alors sur les
  exercices disponibles). Ajouter un exercice les couvrant est le
  complement naturel.
- **Pas de test d'evaluation camera** : le niveau de depart est estime
  uniquement a partir de l'historique enregistre (moyenne des 5 dernieres
  seances). Un test devant la camera (ex. repetitions max en 30 secondes)
  reste a construire pour les personnes sans historique.
- **Colonne `repetitions` reutilisee pour les maintiens** : pour la
  planche (exercice en secondes, pas en repetitions), la colonne
  `repetitions` de la table `historique` stocke le nombre de secondes
  tenues, faute d'une colonne dediee dans le schema minimal actuel.
- **Classement en repetitions brutes toutes disciplines confondues** : le
  total affiche additionne des repetitions et des secondes de maintien
  sans distinction ; correct pour un classement simple entre amis, moins
  pour comparer rigoureusement des seances tres differentes.
- Le pseudo n'est pas normalise : deux saisies differentes (majuscules,
  espaces) creent deux entrees distinctes dans le classement. Chacun doit
  garder le meme pseudo.
- Les tables de donnees Supabase restent ouvertes en ecriture : voir
  "Ce qui reste ouvert, deliberement" ci-dessus. Une seance peut donc
  toujours etre fabriquee en tapant directement dans l'API ; le code PIN
  protege l'identite, pas les chiffres.
- **Aucune recuperation de code PIN oublie.** Il n'y a ni email ni
  telephone pour renvoyer quoi que ce soit. Le seul recours est
  l'administrateur, qui peut supprimer le compte (l'historique part avec).
  Ajouter une remise a zero du code par l'administrateur serait le
  complement naturel : la fonction `modifier_code_pin` existe deja, il
  suffirait d'une variante acceptant le code administrateur.
- **Un code bloque peut servir a embeter quelqu'un.** Depuis la migration
  0004, 5 essais errones bloquent un compte 15 minutes (c'est ce qui rend
  l'enumeration d'un code a 4 chiffres impraticable). Le revers : n'importe
  qui connaissant un pseudo peut maintenir ce compte bloque en se trompant
  volontairement, y compris celui de l'administrateur. Genant, jamais
  destructeur, et le blocage se leve tout seul.
- **Reprendre un compte sans code reste possible.** L'ecran d'entree
  previent quand le pseudo vise a deja un historique, et la base marque la
  reprise (`codes_acces.adopte`), mais elle ne l'interdit pas : l'interdire
  priverait definitivement de leur historique les membres dont le compte
  date d'avant les codes PIN.
- **Videos non transcodees et jamais purgees automatiquement.** Chaque
  seance filmee pese quelques megaoctets dans le bucket `seances` (1 Go
  offert sur le plan gratuit Supabase). Rien ne supprime les vieilles
  videos : le menage se fait a la main depuis l'ecran Administration
  (suppression d'une seance) ou en supprimant un compte.
- **Enregistrement video absent sur les navigateurs sans `MediaRecorder`
  ni `canvas.captureStream`.** La seance se deroule alors normalement,
  simplement sans video (`isRecordingSupported()` dans
  `src/core/sessionRecorder.js`), et elle ne pourra pas etre verifiee.
- Un signalement peut etre depose autant de fois qu'on veut sur la meme
  seance : rien n'empeche le harcelement d'un membre. Vu la taille du
  groupe, la moderation humaine suffit.
- Pas de recuperation d'acces si le mot de passe de groupe change : il faut
  alors redemander a chacun de le ressaisir (bouton "Changer de pseudo" sur
  l'ecran d'accueil).
