# BSE push up

Coach de musculation au poids de corps par vision par ordinateur
(MediaPipe), avec ciblage musculaire 3D, generation de seance, coach vocal
et classement de groupe. Concu pour un petit groupe ferme (une dizaine de
personnes), pas pour un usage grand public.

## Parcours utilisateur

`gate` (pseudo ; mot de passe de groupe desactive temporairement, voir
`PASSCODE_ENABLED` dans `src/ui/screens/gate.js`) -> `home` (stats,
historique) -> `targeting` (ciblage 3D des muscles a travailler) ->
`workoutSetup` (analyse biomecanique, temps disponible, plan genere) ->
`session` (exercices et series, flash plein ecran a chaque repetition
validee, pause fixe de 30 secondes entre les series, coach vocal) ->
retour a `home`.

## Architecture

- **Build** : Vite (modules ES natifs, dev server rapide)
- **Interface** : JavaScript vanilla, sans framework
- **Vision par ordinateur** : `@mediapipe/tasks-vision` (`PoseLandmarker`),
  l'API MediaPipe actuellement maintenue par Google. Le moteur est
  multi-exercices : voir "Moteur multi-exercices" ci-dessous
- **Ciblage 3D** : Three.js, corps stylise en primitives (pas un maillage
  anatomique reel, voir "Limites connues")
- **Generation de seance** : algorithme deterministe base sur des regles
  (pas de machine learning), voir "Generation de seance"
- **Voix** : Web Speech API (`SpeechSynthesis`) native au navigateur, aucun
  service tiers, fonctionne hors ligne
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
    geometry.js, landmarks.js, poseEngine.js, cameraStream.js, date.js,
    withTimeout.js
  biomechanics/   taxonomie des muscles + regles d'equilibre (antagonistes)
  workout/        generateur de seance (temps, muscles, niveau -> plan)
  audio/          coach vocal (file d'attente, anti-spam, transitions)
  lib/            client Supabase
  auth/           gestion locale du pseudo + verification du mot de passe
  db/             acces direct aux tables Supabase (historique, classement)
  ui/
    threeBody/    scene et corps 3D (Three.js)
    screens/      gate, home, targeting, workoutSetup, session, leaderboard
supabase/migrations/0001_init.sql   schema complet (tables + policies)
public/       manifest PWA, icones
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
partir de la moyenne des reps des 5 dernieres seances enregistrees) et
produit une liste de blocs (exercice, series, repetitions ou secondes de
maintien), ajustee pour tenir dans le temps donne (pause de repos
comprise, voir `REST_SECONDS`). Regles fixes, pas d'apprentissage
automatique. Une pause fixe de 30 secondes (identique pour tous les
exercices, voir `REST_SECONDS` dans `src/workout/generator.js`) separe
chaque serie.

`src/biomechanics/balanceRules.js` verifie, pour chaque muscle
selectionne, si l'un de ses antagonistes declares (`muscleGroups.js`) est
absent de la selection, et le cas echeant previent d'un risque de
desequilibre et suggere de l'ajouter.

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
2. Ouvrir l'editeur SQL du projet et executer l'integralite du fichier
   `supabase/migrations/0001_init.sql`.
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
d'alignement dans `computeMetrics`). Les preréglages de serie (nombre de
series, repetitions, secondes de maintien par niveau) sont dans
`LEVEL_PRESETS` (`src/workout/generator.js`).

## Coach vocal

`src/audio/coach.js` gere une file d'attente courte (3 messages maximum),
un anti-spam par cooldown independant pour chaque type d'alerte (5
secondes), et des encouragements declenches uniquement pendant les temps
morts (file vide, pas de parole en cours), toutes les 20 secondes au plus.
Un bouton "Son" dans l'ecran de seance permet de la couper a tout moment.
Les transitions de seance (debut d'exercice, debut/fin de repos, exercice
suivant, fin de seance) coupent la parole en cours : ce sont des
changements de contexte nets qui doivent passer avant le reste. Le
coach vocal ne leve jamais d'exception vers son appelant (voir
`src/audio/coach.js`) : meme si la Web Speech API se comporte mal
(frequent sur Safari iOS), la progression de la seance (repos, serie
suivante) n'en depend jamais.

A chaque repetition validee, un flash plein ecran (vert, ~380 ms, via
l'API Web Animations) s'ajoute au changement de couleur du bandeau de
message.

## Limites connues

- **Mot de passe de groupe desactive temporairement** : l'ecran d'acces ne
  demande plus que le pseudo (`PASSCODE_ENABLED = false` dans
  `src/ui/screens/gate.js`). A remettre a `true` pour retablir le filtre.
- **Corps 3D stylise, pas anatomique** : le ciblage utilise des primitives
  (capsules/boites) groupees par muscle, pas un maillage anatomique
  segmente (ceux-ci sont generalement des assets proprietaires). Un vrai
  maillage glTF segmente par muscle se brancherait au meme endroit
  (`src/ui/threeBody/buildBody.js`) sans changer le reste de
  l'architecture, qui ne depend que du nom de muscle attache a chaque
  partie (`mesh.userData.muscleId`).
- **Fentes simplifiees** : suivent l'angle du genou avant comme un squat,
  sans distinguer jambe avant/arriere ni largeur de fente.
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
