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
let durationColumnAvailable = true;
let moderationColumnsAvailable = true;

function isMissingDurationColumn(err) {
  return isMissingColumn(err, "duree_secondes");
}

function isMissingModerationColumn(err) {
  return isMissingColumn(err, "video_path") || isMissingColumn(err, "annulee") || isMissingColumn(err, "repetitions_initiales");
}

export function isModerationAvailable() {
  return moderationColumnsAvailable;
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

  try {
    await execute(supabase.from("historique").insert(row));
  } catch (err) {
    if (isMissingDurationColumn(err)) {
      durationColumnAvailable = false;
      delete row.duree_secondes;
      console.warn(
        "Colonne duree_secondes absente : seance enregistree sans duree. " +
          "Executer supabase/migrations/0002_duree_seances.sql pour l'activer."
      );
    } else if (isMissingModerationColumn(err)) {
      moderationColumnsAvailable = false;
      delete row.video_path;
      console.warn(
        "Colonne video_path absente : seance enregistree sans video. " +
          "Executer supabase/migrations/0003_comptes_signalements_videos.sql pour l'activer."
      );
    } else {
      throw err;
    }
    await execute(supabase.from("historique").insert(row));
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
function selectSessions(columns, build) {
  const run = async () => {
    const cols = [
      ...columns,
      ...(durationColumnAvailable ? ["duree_secondes"] : []),
      ...(moderationColumnsAvailable ? ["video_path", "annulee", "repetitions_initiales"] : [])
    ].join(", ");

    let query = supabase.from("historique").select(cols);
    if (moderationColumnsAvailable) query = query.eq("annulee", false);
    return execute(build(query));
  };

  return run().catch((err) => {
    if (isMissingDurationColumn(err)) {
      durationColumnAvailable = false;
    } else if (isMissingModerationColumn(err)) {
      moderationColumnsAvailable = false;
    } else {
      throw err;
    }
    return run();
  });
}

function mapSession(row) {
  return {
    id: row.id,
    reps: row.repetitions,
    exerciseLabel: row.nom_exercice,
    durationSeconds: row.duree_secondes ?? null,
    videoPath: row.video_path ?? null,
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
// [{ id, reps, exerciseLabel, durationSeconds, videoPath, performedOn, createdAt }]
export async function fetchUserSessions(username, limit = 10) {
  ensureConfigured();
  const data = await selectSessions(["id", "repetitions", "nom_exercice", "date", "created_at"], (q) =>
    q.eq("pseudo", username).order("created_at", { ascending: false }).limit(limit)
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

  const columns = [
    "id",
    "pseudo",
    "repetitions",
    "nom_exercice",
    "date",
    "created_at",
    ...(durationColumnAvailable ? ["duree_secondes"] : []),
    ...(moderationColumnsAvailable ? ["video_path", "annulee", "repetitions_initiales"] : [])
  ].join(", ");

  const data = await execute(supabase.from("historique").select(columns).in("id", liste));
  const map = new Map();
  for (const row of data || []) {
    map.set(row.id, { ...mapSession(row), username: row.pseudo });
  }
  return map;
}
