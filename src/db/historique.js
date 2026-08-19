import { supabase, execute, ensureConfigured, isMissingColumn } from "./execute.js";
import { localDateKey } from "../core/date.js";

export { HistoriqueError, HistoriqueUnavailableError, describeHistoriqueError } from "./errors.js";

// Enregistre le pseudo s'il n'existe pas encore. Le conflit (pseudo deja
// present) est attendu et sans consequence : on l'ignore.
export async function ensureUser(pseudo) {
  ensureConfigured();
  try {
    await execute(supabase.from("utilisateurs").insert({ pseudo }));
  } catch (err) {
    // 23505 = violation de contrainte unique (pseudo deja enregistre)
    if (err.code === "23505") return;
    throw err;
  }
}

// Colonnes ajoutees par des migrations posterieures au schema initial.
// Tant qu'une migration n'a pas ete executee, la base refuse la colonne :
// plutot que de perdre la seance ou de casser un ecran, on rejoue la
// requete sans la colonne et on note qu'elle est absente. Une fois la
// migration passee, tout se remet en place sans toucher au code.
//   duree_secondes                       -> migration 0002
//   video_path, annulee, repetitions_...  -> migration 0003
//   video_purgee                          -> migration 0005
let durationColumnAvailable = true;
let moderationColumnsAvailable = true;
let purgeColumnAvailable = true;

function isMissingDurationColumn(err) {
  return isMissingColumn(err, "duree_secondes");
}

function isMissingModerationColumn(err) {
  return isMissingColumn(err, "video_path") || isMissingColumn(err, "annulee") || isMissingColumn(err, "repetitions_initiales");
}

// Desactive le groupe de colonnes que l'erreur designe. Renvoie false si
// l'erreur ne parle d'aucune colonne connue : l'appelant doit alors la
// laisser remonter.
//
// Une base ne peut signaler qu'une colonne manquante a la fois, alors qu'il
// peut en manquer plusieurs (aucune migration passee depuis 0001). C'est
// pour ca que les appelants reessaient en boucle et non une seule fois :
// avec un seul essai, la deuxieme colonne absente fait echouer la requete
// pour de bon, et l'ecran affiche une erreur au lieu de se degrader.
function disableMissingColumns(err) {
  if (isMissingDurationColumn(err)) {
    durationColumnAvailable = false;
    return true;
  }
  if (isMissingModerationColumn(err)) {
    moderationColumnsAvailable = false;
    return true;
  }
  if (isMissingColumn(err, "video_purgee")) {
    purgeColumnAvailable = false;
    return true;
  }
  return false;
}

async function submitExerciseResult({ username, exerciseLabel, muscles, reps, durationSeconds, videoPath }) {
  const row = {
    pseudo: username,
    nom_exercice: exerciseLabel,
    repetitions: Math.max(0, Math.round(reps)),
    muscles_travailles: muscles.join(", ")
  };

  if (durationColumnAvailable) {
    row.duree_secondes =
      durationSeconds === null || durationSeconds === undefined ? null : Math.max(0, Math.round(durationSeconds));
  }
  if (moderationColumnsAvailable && videoPath) {
    row.video_path = videoPath;
  }

  // Boucle plutot qu'un seul reessai : il peut manquer la colonne de 0002
  // ET celles de 0003. Perdre une seance parce qu'une migration a ete
  // oubliee serait le pire resultat possible ici.
  for (;;) {
    try {
      await execute(supabase.from("historique").insert(row));
      return;
    } catch (err) {
      if (!disableMissingColumns(err)) throw err;

      let allege = false;
      if (!durationColumnAvailable && "duree_secondes" in row) {
        delete row.duree_secondes;
        allege = true;
        console.warn(
          "Colonne duree_secondes absente : seance enregistree sans duree. " +
            "Executer supabase/migrations/0002_duree_seances.sql pour l'activer."
        );
      }
      if (!moderationColumnsAvailable && "video_path" in row) {
        delete row.video_path;
        allege = true;
        console.warn(
          "Colonne video_path absente : seance enregistree sans video. " +
            "Executer supabase/migrations/0003_comptes_signalements_videos.sql pour l'activer."
        );
      }

      // La base refuse une colonne que la ligne ne porte deja plus : on ne
      // sait pas quoi retirer de plus, et reessayer a l'identique
      // tournerait en boucle.
      if (!allege) throw err;
    }
  }
}

// results : [{ exerciseLabel, muscles, reps, durationSeconds }] - une ligne par exercice
// effectue pendant la seance (les exercices a 0 repetition/seconde sont
// ignores). videoPath : chemin de la video de la seance dans le Storage,
// partage par toutes les lignes de cette seance.
export async function submitWorkoutResults(username, results, { videoPath = null } = {}) {
  ensureConfigured();
  await ensureUser(username);

  for (const result of results) {
    if (result.reps <= 0) continue;
    await submitExerciseResult({ username, videoPath, ...result });
  }
}

// Colonnes lues selon les migrations disponibles. Les seances annulees par
// l'administrateur sont exclues partout : elles ne comptent plus ni au
// classement ni dans les statistiques, mais restent en base comme trace de
// la decision (elles reapparaissent, marquees, sur l'ecran de profil).
async function selectSessions(columns, build, { includeCancelled = false } = {}) {
  // Meme boucle que pour l'ecriture : autant de tentatives que de groupes
  // de colonnes a retirer, jamais une seule.
  for (;;) {
    const avecDuree = durationColumnAvailable;
    const avecModeration = moderationColumnsAvailable;
    const avecPurge = purgeColumnAvailable;

    const cols = [
      ...columns,
      ...(avecDuree ? ["duree_secondes"] : []),
      ...(avecModeration ? ["video_path", "annulee", "repetitions_initiales"] : []),
      ...(avecPurge ? ["video_purgee"] : [])
    ].join(", ");

    let query = supabase.from("historique").select(cols);
    if (avecModeration && !includeCancelled) query = query.eq("annulee", false);

    try {
      return await execute(build(query));
    } catch (err) {
      if (!disableMissingColumns(err)) throw err;
      // Aucun groupe de colonnes n'a change : reessayer donnerait le meme
      // resultat.
      if (
        avecDuree === durationColumnAvailable &&
        avecModeration === moderationColumnsAvailable &&
        avecPurge === purgeColumnAvailable
      ) {
        throw err;
      }
    }
  }
}

function mapSession(row) {
  return {
    id: row.id,
    reps: row.repetitions,
    exerciseLabel: row.nom_exercice,
    durationSeconds: row.duree_secondes ?? null,
    videoPath: row.video_path ?? null,
    // Video effacee parce que la seance est close : a distinguer d'une
    // seance qui n'a jamais eu de video.
    videoPurged: Boolean(row.video_purgee),
    cancelled: Boolean(row.annulee),
    originalReps: row.repetitions_initiales ?? null,
    performedOn: row.date,
    createdAt: row.created_at
  };
}

// Retourne un tableau trie par total de repetitions decroissant :
// [{ username, totalReps, sessions, todayReps, lastSession }]
export async function fetchLeaderboard() {
  ensureConfigured();
  const data = await selectSessions(["pseudo", "repetitions", "date", "created_at"], (q) => q);

  const todayKey = localDateKey();

  const totals = new Map();
  for (const row of data || []) {
    const entry = totals.get(row.pseudo) || {
      username: row.pseudo,
      totalReps: 0,
      sessions: 0,
      todayReps: 0,
      lastSession: row.created_at
    };
    entry.totalReps += row.repetitions;
    entry.sessions += 1;
    if (row.date === todayKey) entry.todayReps += row.repetitions;
    if (row.created_at > entry.lastSession) entry.lastSession = row.created_at;
    totals.set(row.pseudo, entry);
  }

  return Array.from(totals.values()).sort((a, b) => b.totalReps - a.totalReps);
}

// Historique recent d'un pseudo :
// [{ id, reps, exerciseLabel, durationSeconds, videoPath, cancelled, performedOn, createdAt }]
//
// includeCancelled : garde les seances annulees par l'administrateur, pour
// que l'ecran de profil puisse les afficher barrees plutot que de les faire
// disparaitre sans explication. Elles restent exclues partout ailleurs
// (classement, statistiques, accueil).
export async function fetchUserSessions(username, limit = 10, { includeCancelled = false } = {}) {
  ensureConfigured();
  const data = await selectSessions(
    ["id", "repetitions", "nom_exercice", "date", "created_at"],
    (q) => q.eq("pseudo", username).order("created_at", { ascending: false }).limit(limit),
    { includeCancelled }
  );
  return (data || []).map(mapSession);
}

// Toutes les seances d'un pseudo sur les N derniers jours (pour la page
// Progression : agregations quotidiennes, par exercice, records...).
export async function fetchUserSessionsRange(username, days = 30) {
  ensureConfigured();
  const since = new Date();
  since.setDate(since.getDate() - days + 1);

  const data = await selectSessions(["id", "repetitions", "nom_exercice", "date", "created_at"], (q) =>
    q.eq("pseudo", username).gte("date", localDateKey(since)).order("created_at", { ascending: true })
  );

  return (data || []).map(mapSession);
}

// Seances designees par un signalement : l'ecran d'administration doit
// pouvoir afficher une seance meme si elle a deja ete annulee, d'ou la
// requete directe plutot que selectSessions (qui filtre les annulations).
export async function fetchSessionsByIds(ids) {
  ensureConfigured();
  const liste = (ids || []).filter(Boolean);
  if (liste.length === 0) return new Map();

  const data = await selectSessions(
    ["id", "pseudo", "repetitions", "nom_exercice", "date", "created_at"],
    (q) => q.in("id", liste),
    { includeCancelled: true }
  );

  const map = new Map();
  for (const row of data || []) {
    map.set(row.id, { ...mapSession(row), username: row.pseudo });
  }
  return map;
}
