import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import { localDateKey } from "../core/date.js";
import { classifyError, HistoriqueUnavailableError, UNAVAILABLE_MESSAGE } from "./errors.js";

export { HistoriqueError, HistoriqueUnavailableError, describeHistoriqueError } from "./errors.js";

// Execute une requete Supabase en ramenant tous les modes d'echec a nos
// deux types d'erreur : indisponibilite (l'application continue) ou erreur
// de requete (a corriger).
async function execute(query) {
  let result;
  try {
    result = await query;
  } catch {
    // fetch a echoue : pas de reponse du tout (reseau, DNS, projet eteint).
    throw new HistoriqueUnavailableError(UNAVAILABLE_MESSAGE);
  }
  if (result.error) throw classifyError(result.error);
  return result.data;
}

function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw new HistoriqueUnavailableError("Supabase n'est pas configure (voir .env.example)");
  }
}

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

// Enregistre le resultat d'un exercice reellement effectue pendant la
// seance. Pour un exercice "maintien" (planche), reps porte le nombre de
// secondes tenues : la colonne repetitions n'a qu'une seule dimension
// numerique disponible, on l'utilise dans ce sens pour cet exercice.
// La colonne duree_secondes est ajoutee par la migration 0002. Tant
// qu'elle n'a pas ete appliquee, la base refuse l'insertion : plutot que
// de perdre la seance, on la reenregistre sans la duree. Une fois la
// migration passee, la duree est enregistree sans rien changer au code.
let durationColumnAvailable = true;

function isMissingDurationColumn(err) {
  const code = err && err.code;
  const message = (err && err.message) || "";
  return (code === "42703" || code === "PGRST204") && message.includes("duree_secondes");
}

async function submitExerciseResult({ username, exerciseLabel, muscles, reps, durationSeconds }) {
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

  try {
    await execute(supabase.from("historique").insert(row));
  } catch (err) {
    if (!isMissingDurationColumn(err)) throw err;

    durationColumnAvailable = false;
    delete row.duree_secondes;
    console.warn(
      "Colonne duree_secondes absente : seance enregistree sans duree. " +
        "Executer supabase/migrations/0002_duree_seances.sql pour l'activer."
    );
    await execute(supabase.from("historique").insert(row));
  }
}

// results : [{ exerciseLabel, muscles, reps, durationSeconds }] - une ligne par exercice
// effectue pendant la seance (les exercices a 0 repetition/seconde sont
// ignores).
export async function submitWorkoutResults(username, results) {
  ensureConfigured();
  await ensureUser(username);

  for (const result of results) {
    if (result.reps <= 0) continue;
    await submitExerciseResult({ username, ...result });
  }
}

// Retourne un tableau trie par total de repetitions decroissant :
// [{ username, totalReps, sessions, todayReps, lastSession }]
export async function fetchLeaderboard() {
  ensureConfigured();
  const data = await execute(supabase.from("historique").select("pseudo, repetitions, date, created_at"));

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
// [{ reps, exerciseLabel, durationSeconds, performedOn, createdAt }]
export async function fetchUserSessions(username, limit = 10) {
  ensureConfigured();

  const query = (columns) =>
    execute(
      supabase
        .from("historique")
        .select(columns)
        .eq("pseudo", username)
        .order("created_at", { ascending: false })
        .limit(limit)
    );

  let data;
  try {
    data = await query(
      durationColumnAvailable
        ? "repetitions, nom_exercice, duree_secondes, date, created_at"
        : "repetitions, nom_exercice, date, created_at"
    );
  } catch (err) {
    // Meme cas que pour l'ecriture : migration 0002 pas encore appliquee.
    if (!isMissingDurationColumn(err)) throw err;
    durationColumnAvailable = false;
    data = await query("repetitions, nom_exercice, date, created_at");
  }

  return (data || []).map((row) => ({
    reps: row.repetitions,
    exerciseLabel: row.nom_exercice,
    durationSeconds: row.duree_secondes,
    performedOn: row.date,
    createdAt: row.created_at
  }));
}

// Toutes les seances d'un pseudo sur les N derniers jours (pour la page
// Progression : agregations quotidiennes, par exercice, records...).
export async function fetchUserSessionsRange(username, days = 30) {
  ensureConfigured();
  const since = new Date();
  since.setDate(since.getDate() - days + 1);

  const data = await execute(
    supabase
      .from("historique")
      .select("repetitions, nom_exercice, date, created_at")
      .eq("pseudo", username)
      .gte("date", localDateKey(since))
      .order("created_at", { ascending: true })
  );

  return (data || []).map((row) => ({
    reps: row.repetitions,
    exerciseLabel: row.nom_exercice,
    performedOn: row.date,
    createdAt: row.created_at
  }));
}
