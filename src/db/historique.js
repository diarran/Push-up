import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import { localDateKey } from "../core/date.js";

export class HistoriqueError extends Error {}

function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw new HistoriqueError("Supabase n'est pas configure (voir .env.example)");
  }
}

// Enregistre le pseudo s'il n'existe pas encore. Le conflit (pseudo deja
// present) est attendu et sans consequence : on l'ignore.
export async function ensureUser(pseudo) {
  ensureConfigured();
  const { error } = await supabase.from("utilisateurs").insert({ pseudo });
  if (error && error.code !== "23505") {
    // 23505 = violation de contrainte unique (pseudo deja enregistre)
    throw new HistoriqueError(error.message);
  }
}

// Enregistre le resultat d'un exercice reellement effectue pendant la
// seance. Pour un exercice "maintien" (planche), reps porte le nombre de
// secondes tenues : la colonne repetitions n'a qu'une seule dimension
// numerique disponible, on l'utilise dans ce sens pour cet exercice.
async function submitExerciseResult({ username, exerciseLabel, muscles, reps, durationSeconds }) {
  const { error } = await supabase.from("historique").insert({
    pseudo: username,
    nom_exercice: exerciseLabel,
    repetitions: Math.max(0, Math.round(reps)),
    duree_secondes:
      durationSeconds === null || durationSeconds === undefined ? null : Math.max(0, Math.round(durationSeconds)),
    muscles_travailles: muscles.join(", ")
  });
  if (error) throw new HistoriqueError(error.message);
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
  const { data, error } = await supabase
    .from("historique")
    .select("pseudo, repetitions, date, created_at");
  if (error) throw new HistoriqueError(error.message);

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
  const { data, error } = await supabase
    .from("historique")
    .select("repetitions, nom_exercice, duree_secondes, date, created_at")
    .eq("pseudo", username)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new HistoriqueError(error.message);

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

  const { data, error } = await supabase
    .from("historique")
    .select("repetitions, nom_exercice, date, created_at")
    .eq("pseudo", username)
    .gte("date", localDateKey(since))
    .order("created_at", { ascending: true });
  if (error) throw new HistoriqueError(error.message);

  return (data || []).map((row) => ({
    reps: row.repetitions,
    exerciseLabel: row.nom_exercice,
    performedOn: row.date,
    createdAt: row.created_at
  }));
}
