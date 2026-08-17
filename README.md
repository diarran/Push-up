# BSE push up

Coach de musculation au poids de corps par vision par ordinateur
(MediaPipe), avec ciblage musculaire 3D, generation de seance, coach
vocal, suivi de progression avec graphiques et classement de groupe.
Concu pour un petit groupe ferme (une dizaine de personnes), pas pour un
usage grand public.

## Parcours utilisateur

`gate` (pseudo ; mot de passe de groupe desactive temporairement, voir
`PASSCODE_ENABLED` dans `src/ui/screens/gate.js`) -> `home` (stats,
historique) -> `targeting` (ciblage 3D des muscles a travailler) ->
`workoutSetup` (analyse biomecanique, temps disponible, plan genere) ->
`tutorial` (demonstration 3D animee du premier exercice du plan, si une
animation existe pour cet exercice ; sinon on passe directement a la
seance, voir "Tutoriels animes") -> `session` (exercices et series
enchaines directement, sans pause, flash plein ecran a chaque repetition
validee, coach vocal, bascule camera avant/arriere) -> retour a `home`.

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
- **Backend** : Supabase (Postgres), deux tables (`utilisateurs`,
  `historique`) en lecture/ecriture ouvertes. Pas de comptes individuels :
  un mot de passe de groupe unique, verifie uniquement cote client, filtre
  l'entree dans l'application
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
    withTimeout.js
  biomechanics/   taxonomie des muscles + regles d'equilibre (antagonistes)
  workout/        generateur de seance + agregations de progression
                  (totaux quotidiens, par exercice, record, streak)
  audio/          coach vocal (file d'attente, anti-spam, transitions)
  lib/            client Supabase
  auth/           gestion locale du pseudo + verification du mot de passe
  db/             acces direct aux tables Supabase (historique, classement)
  ui/
    threeBody/    corps 3D (Three.js) : loadAnatomyModel.js charge le
                  maillage anatomique, buildBody.js pose les volumes de
                  detection par muscle, hologramMaterial.js est le shader
                  hologramme partage entre le ciblage et les tutoriels
    charts/       graphiques SVG maison (courbe, barres), sans dependance
    screens/      gate, home, targeting, tutorial, workoutSetup, session,
                  progress, leaderboard
supabase/migrations/   0001_init.sql (schema) + 0002_duree_seances.sql
public/       manifest PWA, icones, models/male_anatomy (corps 3D glTF)
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
du premier exercice du plan genere, avec la meme identite visuelle que le
ciblage (hologramme, bloom, rotation libre a la souris/au doigt). Le corps
anime (`src/core/rig/buildRig.js`) reprend les proportions de
`buildBody.js` mais avec les bras en vraie hierarchie de pivots
(epaule -> coude) pour pouvoir etre animes ; le reste du corps reste
statique. Une animation est une simple liste de reperes temporels avec un
angle par pivot (`src/core/rig/animationClips.js`), lue en boucle par
interpolation lineaire (`src/core/rig/animateRig.js`).

Ce n'est pas de la capture de mouvement ni un rig biomecanique complet :
une approximation stylisee suffisante pour montrer le sens du geste sous
tous les angles. Seules les pompes ont une animation pour l'instant ; les
autres exercices utilisent le meme format et peuvent etre ajoutes sans
changer le lecteur. Si le premier exercice du plan n'a pas d'animation,
l'ecran est saute automatiquement et la seance demarre directement.

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

## Pourquoi pas de comptes individuels

Le groupe compte une dizaine de personnes maximum. Une authentification par
email (inscription, confirmation, mot de passe oublie) serait une charge
inutile pour cet usage. A la place :

- un **mot de passe de groupe** unique, partage entre les membres, verifie
  uniquement cote client (comparaison avec `VITE_GROUP_PASSCODE`) avant
  d'entrer dans l'application
- un **pseudo libre**, saisi une fois et memorise sur l'appareil

Limite assumee, deliberement : les tables `utilisateurs` et `historique`
sont en lecture/ecriture ouvertes (policies RLS `using (true)`), pour que
le classement reste simple et instantane entre les dix membres du groupe.
La cle publique Supabase (`anon key`) est de toute facon visible dans le
code cote client, comme pour toute application front-end statique ; le mot
de passe de groupe est donc une barriere pour decourager un inconnu qui
tomberait sur le lien de l'application, pas une protection de niveau
entreprise. Si ce niveau de protection devient insuffisant un jour (fuite
du lien, groupe qui grandit), il faudra revenir a un acces verifie cote
serveur (fonctions Postgres `security definer`, comme dans une version
precedente de ce depot).

## Mise en place de Supabase

1. Creer un projet gratuit sur supabase.com.
2. Ouvrir l'editeur SQL du projet et executer, dans l'ordre, chaque fichier
   de `supabase/migrations/` (`0001_init.sql` puis `0002_duree_seances.sql`).
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

Le lissage introduit un retard volontaire de une a deux frames (~60 ms a
30 images/seconde). En simulation, le comptage reste exact de 2 s par
pompe jusqu'a 0,5 s par pompe ; il ne decroche qu'au-dela de 3 pompes par
seconde, cadence hors de portee humaine. Augmenter `smoothing` (vers 1)
reduit ce retard mais laisse repasser le bruit ; le baisser lisse
davantage au prix de la reactivite.

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
- Les tables Supabase sont ouvertes en lecture/ecriture : voir la section
  "Pourquoi pas de comptes individuels" ci-dessus pour le detail du
  compromis et comment revenir en arriere si besoin.
- Pas de recuperation d'acces si le mot de passe de groupe change : il faut
  alors redemander a chacun de le ressaisir (bouton "Changer de pseudo ou
  de code" sur l'ecran d'accueil).
