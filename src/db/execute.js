import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import { classifyError, HistoriqueUnavailableError, UNAVAILABLE_MESSAGE } from "./errors.js";

// Execute une requete Supabase en ramenant tous les modes d'echec a nos
// deux types d'erreur : indisponibilite (l'application continue) ou erreur
// de requete (a corriger).
export async function execute(query) {
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

export function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw new HistoriqueUnavailableError("Supabase n'est pas configure (voir .env.example)");
  }
}

export { supabase, isSupabaseConfigured };

// PGRST202 : PostgREST ne trouve pas la fonction appelee. C'est le signe
// que la migration 0003 n'a pas encore ete executee, pas une panne : les
// ecrans concernes retombent alors sur l'ancien comportement.
export function isMissingFunction(err) {
  const code = err && err.code;
  const message = (err && err.message) || "";
  return code === "PGRST202" || message.includes("Could not find the function");
}

// Colonne absente : meme logique, pour les colonnes ajoutees par une
// migration pas encore appliquee (42703 cote Postgres, PGRST204 cote cache
// de schema PostgREST).
export function isMissingColumn(err, columnName) {
  const code = err && err.code;
  const message = (err && err.message) || "";
  return (code === "42703" || code === "PGRST204") && message.includes(columnName);
}
