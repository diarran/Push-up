# BSE push up

Tracker de pompes par vision par ordinateur (MediaPipe), avec coach vocal et
classement de groupe. Concu pour un petit groupe ferme (une dizaine de
personnes), pas pour un usage grand public.

## Architecture

- **Build** : Vite (modules ES natifs, dev server rapide)
- **Interface** : JavaScript vanilla, sans framework
- **Vision par ordinateur** : `@mediapipe/tasks-vision` (`PoseLandmarker`),
  l'API MediaPipe actuellement maintenue par Google (remplace les anciens
  scripts CDN `pose.js` / `camera_utils` utilises dans les premieres
  versions du prototype, aujourd'hui depreciees)
- **Voix** : Web Speech API (`SpeechSynthesis`) native au navigateur, aucun
  service tiers, fonctionne hors ligne
- **Backend** : Supabase (Postgres), utilise uniquement comme base de
  donnees via des fonctions RPC. Pas de comptes individuels : un mot de
  passe de groupe unique protege l'ecriture et la lecture des scores
- **PWA** : `vite-plugin-pwa` (manifest deja fourni dans `public/`, service
  worker genere automatiquement au build)

```
src/
  core/       geometrie, machine a etats du compteur, moteur de pose, camera
  audio/      coach vocal (file d'attente, anti-spam, encouragements)
  lib/        client Supabase
  auth/       gestion locale de la session de groupe (mot de passe + pseudo)
  db/         appels RPC Supabase (scores, classement)
  ui/         ecrans (gate, home, session, leaderboard) et navigation
supabase/migrations/0001_init.sql   schema complet + fonctions d'acces
public/       manifest PWA, icones
```

## Pourquoi pas de comptes individuels

Le groupe compte une dizaine de personnes maximum. Une authentification par
email (inscription, confirmation, mot de passe oublie) serait une charge
inutile pour cet usage. A la place :

- un **mot de passe de groupe** unique, partage entre les membres, verifie
  cote serveur avant toute lecture ou ecriture
- un **pseudo libre**, saisi une fois et memorise sur l'appareil

Le mot de passe et le pseudo sont mis en cache dans `localStorage` : chaque
personne ne les saisit qu'une seule fois par appareil.

Limite assumee : la cle publique Supabase (`anon key`) est necessairement
visible dans le code cote client, comme pour toute application front-end
statique. Le mot de passe de groupe est donc une barriere pour decourager un
inconnu qui tomberait sur le lien de l'application, pas une protection de
niveau entreprise. Elle est neanmoins verifiee cote serveur (fonctions
Postgres `security definer`), pas seulement cote interface : la table
`scores` n'est accessible par aucune policy publique, uniquement via les
fonctions qui verifient le mot de passe.

## Mise en place de Supabase

1. Creer un projet gratuit sur supabase.com.
2. Ouvrir l'editeur SQL du projet et executer l'integralite du fichier
   `supabase/migrations/0001_init.sql`.
3. A la fin de ce meme fichier, remplacer `'change-me'` par le mot de passe
   de groupe reel avant de l'executer (ou modifier la ligne directement
   dans l'editeur SQL apres coup) :
   ```sql
   update public.app_config set group_passcode = 'votre-mot-de-passe';
   ```
4. Dans Project Settings > API, recuperer l'URL du projet et la cle
   publique (`anon public key`).

## Configuration locale

```bash
cp .env.example .env
# renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
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

## Reglages du moteur de detection

Les seuils sont centralises dans `src/core/repCounter.js`
(`DEFAULT_REP_CONFIG`) :

- `downAngle` (90 degres) : coude plie pour valider le bas du mouvement
- `upAngle` (160 degres) : coude tendu pour valider le haut du mouvement
  et compter la repetition
- `alignAngle` (160 degres) : angle epaule-hanche-cheville minimum pour
  considerer le dos droit

## Coach vocal

`src/audio/coach.js` gere une file d'attente courte (3 messages maximum),
un anti-spam par cooldown independant pour chaque type d'alerte (5
secondes), et des encouragements declenches uniquement pendant les temps
morts (file vide, pas de parole en cours), toutes les 20 secondes au plus.
Un bouton "Voix" dans l'ecran de seance permet de la couper a tout moment.

## Limites connues

- Le pseudo n'est pas normalise : deux saisies differentes (majuscules,
  espaces) creent deux entrees distinctes dans le classement. Chacun doit
  garder le meme pseudo.
- Pas de recuperation d'acces si le mot de passe de groupe change : il faut
  alors redemander a chacun de le ressaisir (bouton "Changer de pseudo ou
  de code" sur l'ecran d'accueil).
