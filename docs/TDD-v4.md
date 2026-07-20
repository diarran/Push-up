# BSE push up — Technical Design Document v4

Statut : ce document couvre la refonte "carte blanche" en 5 piliers. Il
distingue ce qui est livre et verifie dans cette passe de ce qui reste a
construire. Chaque pilier est concu pour s'integrer dans l'architecture
existante (registre d'exercices, ctx partage, ecrans lazy-loaded) sans
reecriture du socle.

Contrainte transverse, non negociable : aucun emoji, nulle part (UI,
code, commentaires, messages vocaux).

## 1. Vue d'ensemble

L'app reste une PWA Vite/vanilla JS (pas de framework), avec Supabase comme
seul service externe (Postgres, RLS ouverte, pas d'auth individuelle — voir
README). La v4 ajoute trois familles de capacites au-dessus du socle
existant (moteur de pose, generateur de seance, ciblage 3D) :

1. Tutoriels 3D animes (memes bases Three.js/hologramme que le ciblage).
2. Dashboard de progression enrichi, avec une carte de fatigue/developpement
   musculaire en 3D alimentee par l'historique Supabase.
3. Un "cerveau IA" a base de regles (pas de ML) qui fait progresser la charge
   dans le temps et renforce l'equilibre biomecanique deja amorce par
   `balanceRules.js`.

Le moteur MediaPipe et le systeme vocal sont durcis en continu (cf. section
5) plutot que reecrits : les bugs deja corriges (visibilite des points,
hysteresis de cote, exceptions Web Speech) sont la base sur laquelle on
construit, pas un chantier a repartir de zero.

## 2. Arborescence des fichiers (etat vise)

```
src/
  audio/
    coach.js                 # existant, durci (try/catch, unlock())
    messages.js               # existant
  auth/
    groupGate.js               # existant
  biomechanics/
    muscleGroups.js            # existant (taxonomie + antagonistes)
    balanceRules.js             # existant
    overloadRules.js           # NOUVEAU (pilier 4)
  core/
    exercises/                  # existant (registre par exercice)
      exerciseEngine.js
      angleRepCounter.js
      holdTimer.js
      pushup.js / squat.js / lunge.js / plank.js
      index.js
    rig/                        # NOUVEAU (pilier 2)
      buildRig.js                # rig hierarchique (pivots epaule/coude)
      animationClips.js           # donnees de keyframes par exercice
      animateRig.js                # lecteur de clip (interpolation + boucle)
    cameraStream.js / poseEngine.js / landmarks.js / geometry.js / date.js
    withTimeout.js
  db/
    historique.js                # existant + agregations pilier 3
  lib/
    supabaseClient.js
  ui/
    threeBody/
      hologramMaterial.js         # NOUVEAU : shader hologramme partage
      buildBody.js                 # existant, refactorise pour consommer
                                    # hologramMaterial.js
      buildHeatmapBody.js          # NOUVEAU (pilier 3) : variante du corps
                                    # dont la couleur par muscle vient d'un
                                    # score de fatigue, pas d'une selection
    charts/
      lineChart.js / barChart.js  # existants (SVG, sans lib externe)
    screens/
      gate.js / home.js / leaderboard.js / progress.js
      targeting.js                 # existant (ciblage musculaire 3D)
      tutorial.js                  # NOUVEAU (pilier 2)
      workoutSetup.js / session.js # existants
    nav.js / escapeHtml.js
  workout/
    generator.js                  # existant, a etendre (pilier 4)
    progressStats.js               # existant
  main.js
public/
supabase/migrations/
docs/
  TDD-v4.md                        # ce document
```

Rien n'est deplace : les ajouts se branchent sur les points d'extension deja
en place (registre d'exercices, `ctx` partage dans `main.js`, lazy-loading
par ecran).

## 3. Pilier 1 — Refonte UI/UX

Portee de cette passe : aucune refonte visuelle large n'a ete faite ici (pas
demande de maquettes precises). Ce qui est en place et reste la base :
identite "hologramme neon" (vert, fond sombre, bloom), transitions d'ecran
via `navigate()`/cleanup, flash plein ecran a la validation d'une repetition.
Prochaine iteration : auditer chaque ecran existant contre cette identite
(actuellement seuls le ciblage et les tutoriels utilisent le rendu 3D ;
home/progress/leaderboard restent en HTML/CSS plat) et proposer des
transitions animees entre ecrans si demande.

## 4. Pilier 2 — Tutoriels 3D animes (livre, perimetre pompes)

### Design

- `core/rig/buildRig.js` construit un rig proche de `buildBody.js` (memes
  proportions, meme materiau `hologramMaterial.js`) mais avec les bras en
  vraie hierarchie de pivots (`shoulderPivot -> elbowPivot`), le reste du
  corps restant statique. C'est suffisant pour animer des pompes ; hanches
  et genoux peuvent etre pivotes de la meme maniere pour squats/fentes.
- `core/rig/animationClips.js` decrit une animation comme une liste de
  reperes temporels (0 a 1, boucle) avec un angle par pivot et un decalage
  vertical global (`bodyDrop`). Ce n'est pas de la capture de mouvement :
  une approximation stylisee suffisante pour montrer le sens du geste sous
  tous les angles pendant que l'utilisateur fait pivoter la camera.
- `core/rig/animateRig.js` echantillonne le clip par interpolation lineaire
  et applique le resultat au rig, a chaque frame.
- `ui/screens/tutorial.js` reutilise le meme gabarit que `targeting.js`
  (scene/camera/renderer/OrbitControls avec autoRotate qui s'interrompt au
  premier geste utilisateur, EffectComposer + bloom). Elle lit le premier
  bloc du plan genere (`ctx.getWorkoutPlan()`), cherche un clip pour son
  `exerciseId`, et si aucun n'existe, passe directement a la seance sans
  bloquer le parcours (squats/fentes/planche n'ont pas encore de clip).

### Flux

`workoutSetup` (generation du plan) -> `tutorial` (si un clip existe pour le
premier exercice du plan) -> `session` (camera + comptage).

### Verifie

- `npm run build` : le chunk `tutorial` se code-split correctement (charge
  a la demande, partage le chunk Three.js avec `targeting`).
- Rendu Playwright : le rig s'affiche (hologramme vert, sol quadrille,
  silhouette coherente avec `buildBody.js`), l'animation tourne, le bouton
  "J'ai compris, commencer" navigue vers `session`.

### Reste a faire

- Auteurs de clips pour squat/fente/planche (meme format, pas de nouveau
  code moteur necessaire).
- Pivots hanche/genou dans `buildRig.js` pour ces mouvements.

## 5. Pilier 3 — Dashboard avance + heatmap 3D (a construire)

### Design propose

- `db/historique.js` : ajouter une agregation par muscle (a partir de
  `historique.muscles_travailles` et des volumes/repetitions), retournant
  un score de fatigue/developpement recent par muscle (ex. somme ponderee
  par recence sur 14 jours, normalisee 0-1).
- `ui/threeBody/buildHeatmapBody.js` : variante de `buildBody.js` qui
  n'expose pas de selection/clic, mais colore chaque partie du corps selon
  son score (du bleu froid "peu sollicite" au blanc chaud "tres sollicite"),
  en reutilisant `hologramMaterial.js` (un uniform de couleur en plus).
  Ce n'est pas un maillage anatomique reel, comme le corps de ciblage.
- `ui/screens/progress.js` : ajouter une section "Carte de fatigue" au-dessus
  des graphiques existants, avec le corps 3D en lecture seule (rotation
  libre, pas de clic).
- Les graphiques SVG existants (`lineChart.js`/`barChart.js`) restent la
  base pour le volume d'entrainement et les courbes de progression ; extension
  possible pour un histogramme par muscle si demande.

### Pourquoi pas construit dans cette passe

Le perimetre demande pour ce tour est explicitement le TDD + l'arborescence
+ le code de base d'initialisation, pas l'implementation complete des 5
piliers. Le pilier 2 sert de preuve de concept pour le pattern general
(reutilisation du materiau hologramme, lazy-loading par ecran) que ce
pilier suivra.

## 6. Pilier 4 — Cerveau IA avance (a construire)

Reste a base de regles explicites (deja le choix assume pour
`generator.js`, pas de ML) :

- `biomechanics/overloadRules.js` (nouveau) : a partir de l'historique
  (`historique.js`), calcule une tendance par exercice (charge moyenne des
  N dernieres seances) et propose une charge legerement superieure a la
  derniere seance reussie (progression continue), avec un plafond de
  securite (pas plus de +10-15% par semaine).
- `generator.js` : remplacer le niveau statique (`debutant`/
  `intermediaire`/`avance` derive d'une moyenne simple) par cette fonction
  de tendance par exercice, tout en gardant `analyzeBalance` comme garde-fou
  d'equilibre agoniste/antagoniste au moment de la selection musculaire.

## 7. Pilier 5 — Moteur MediaPipe "infaillible" (durcissement continu)

Pas une reecriture : le moteur actuel (`exerciseEngine.js`,
`pickSideGeneric`, split core/form points) a deja corrige les trois causes
reelles de reps non comptees (visibilite trop stricte, seuil d'alignement
trop strict, oscillation gauche/droite). La suite de ce chantier, quand
demandee :

- Retour vocal de correction posturale en temps reel (pas seulement
  valider/refuser la repetition, mais dire *pourquoi* — ex. "descends
  davantage", "garde le dos droit") a partir des metriques deja calculees
  par `computeMetrics`.
- Detection de transition plus fine (actuellement machine a etats simple
  haut/bas par exercice) pour des mouvements a plusieurs phases.
- Modularite confirmee : ajouter un exercice = un fichier dans
  `core/exercises/` respectant le contrat existant (`createState`,
  `computeMetrics`, `points`), sans toucher au moteur generique.

## 8. Ce qui est livre dans cette passe

- `hologramMaterial.js` : extraction du shader hologramme en module partage
  (source unique pour ciblage ET tutoriels).
- `core/rig/` (3 fichiers) + `ui/screens/tutorial.js` : tutoriel 3D anime,
  fonctionnel pour les pompes, cable dans `main.js` (route `tutorial`,
  lazy-loaded comme `targeting`) et dans le flux
  (`workoutSetup -> tutorial -> session`).
- Ce document (arborescence cible + plan des 3 piliers restants).

## 9. Ce qui reste, par ordre de dependance

1. Clips squat/fente/planche (pilier 2, extension directe du format existant).
2. Agregation de fatigue par muscle + heatmap 3D (pilier 3) : depend d'assez
   d'historique reel pour etre utile, peut etre construit en parallele.
3. Tendance de charge / surcharge progressive (pilier 4) : depend de
   l'agregation d'historique deja utilisee par le pilier 3, mutualisable.
4. Retour vocal de correction posturale (pilier 5) : independant, peut se
   faire a tout moment sur le moteur existant.
5. Audit UI/UX large (pilier 1) : transverse, a faire en dernier une fois
   les nouveaux ecrans en place pour homogeneiser l'ensemble.
