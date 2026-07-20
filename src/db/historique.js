import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import { localDateKey } from "../core/date.js";

export class HistoriqueError extends Error {}

const DEFAULT_EXERCICE = "Pompes";
const DEFAULT_MUSCLES = "Pectoraux, triceps, epaules";

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

export async function submitSession({ username, reps, durationSeconds }) {
  ensureConfigured();
  await ensureUser(username);

  const { error } = await supabase.from("historique").insert({
    pseudo: username,
    nom_exercice: DEFAULT_EXERCICE,
    repetitions: Math.max(0, Math.round(reps)),
    muscles_travailles: DEFAULT_MUSCLES
  });
  if (error) throw new HistoriqueError(error.message);
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

// Historique recent d'un pseudo : [{ reps, performedOn, createdAt }]
export async function fetchUserSessions(username, limit = 10) {
  ensureConfigured();
  const { data, error } = await supabase
    .from("historique")
    .select("repetitions, date, created_at")
    .eq("pseudo", username)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new HistoriqueError(error.message);

  return (data || []).map((row) => ({
    reps: row.repetitions,
    performedOn: row.date,
    createdAt: row.created_at
  }));
}
