import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";

export class ScoresError extends Error {}

function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw new ScoresError("Supabase n'est pas configure (voir .env.example)");
  }
}

// Verifie le mot de passe de groupe. Retourne true/false, ne leve pas.
export async function verifyPasscode(passcode) {
  ensureConfigured();
  const { data, error } = await supabase.rpc("check_passcode", { p_passcode: passcode });
  if (error) throw new ScoresError(error.message);
  return Boolean(data);
}

export async function submitScore({ passcode, username, reps, durationSeconds }) {
  ensureConfigured();
  const { error } = await supabase.rpc("submit_score", {
    p_passcode: passcode,
    p_username: username,
    p_reps: reps,
    p_duration_seconds: Math.round(durationSeconds || 0)
  });
  if (error) throw new ScoresError(error.message);
}

// Retourne un tableau trie par total de repetitions decroissant :
// [{ username, totalReps, sessions, todayReps, lastSession }]
export async function fetchLeaderboard(passcode) {
  ensureConfigured();
  const { data, error } = await supabase.rpc("get_leaderboard", { p_passcode: passcode });
  if (error) throw new ScoresError(error.message);

  return (data || []).map((row) => ({
    username: row.username,
    totalReps: Number(row.total_reps),
    sessions: Number(row.sessions),
    todayReps: Number(row.today_reps),
    lastSession: row.last_session
  }));
}

// Historique recent d'un pseudo : [{ reps, durationSeconds, performedOn, createdAt }]
export async function fetchUserSessions(passcode, username, limit = 10) {
  ensureConfigured();
  const { data, error } = await supabase.rpc("get_user_sessions", {
    p_passcode: passcode,
    p_username: username,
    p_limit: limit
  });
  if (error) throw new ScoresError(error.message);

  return (data || []).map((row) => ({
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    performedOn: row.performed_on,
    createdAt: row.created_at
  }));
}
