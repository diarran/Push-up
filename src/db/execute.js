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

// Texte complet d'une erreur : `message` porte parfois un libelle
// generique (cas des indisponibilites, voir classifyError) et le texte
// d'origine de la base se trouve alors dans `detail`. Les deux sont
// inspectes, sans quoi une detection basee sur le message rate
// silencieusement toutes les erreurs reclassees.
function errorText(err) {
  return `${(err && err.message) || ""} ${(err && err.detail) || ""}`;
}

// PGRST202 : PostgREST ne trouve pas la fonction appelee. C'est le signe
// que la migration 0003 n'a pas encore ete executee, pas une panne : les
// ecrans concernes retombent alors sur l'ancien comportement.
export function isMissingFunction(err) {
  const code = err && err.code;
  return code === "PGRST202" || errorText(err).includes("Could not find the function");
}

// Table absente. PostgREST repond PGRST205 aussi bien pour une table
// inconnue que pour un cache de schema encore froid : seul le message, qui
// nomme la table, permet de distinguer les deux.
export function isMissingTable(err, tableName) {
  const code = err && err.code;
  if (code !== "42P01" && code !== "PGRST205") return false;
  return errorText(err).includes(tableName);
}

// Colonne absente : meme logique, pour les colonnes ajoutees par une
// migration pas encore appliquee (42703 cote Postgres, PGRST204 cote cache
// de schema PostgREST).
export function isMissingColumn(err, columnName) {
  const code = err && err.code;
  return (code === "42703" || code === "PGRST204") && errorText(err).includes(columnName);
}
