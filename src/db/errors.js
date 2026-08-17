// Types d'erreur de la couche donnees et classification des echecs
// Supabase. Isole du client Supabase (aucun import) pour rester testable
// et pour que les ecrans puissent importer les types sans tirer le client.

export class HistoriqueError extends Error {}

// Base injoignable, par opposition a une vraie erreur de requete : reseau
// coupe, projet Supabase en veille (le plan gratuit met en pause les
// projets inactifs), ou cache de schema pas encore chaud juste apres le
// reveil du projet. Distinguee du reste parce qu'elle ne doit jamais
// empecher d'utiliser l'application : compter des pompes ne depend pas de
// la base, seul l'enregistrement en depend.
export class HistoriqueUnavailableError extends HistoriqueError {}

export const UNAVAILABLE_MESSAGE = "Base de donnees injoignable";

// PGRST205 : PostgREST ne connait pas encore les tables. Se produit
// quelques instants apres le reveil d'un projet en pause, le temps que son
// cache de schema se reconstruise ; ce n'est pas une table manquante.
const TRANSIENT_CODES = new Set(["PGRST205"]);

// Traduit une erreur renvoyee par Supabase en HistoriqueError (requete a
// corriger) ou HistoriqueUnavailableError (base momentanement absente).
export function classifyError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const isDatabaseAnswer = code.startsWith("PGRST") || /^[0-9A-Z]{5}$/.test(code);

  // Sans code exploitable, la reponse ne vient pas de la base elle-meme
  // mais d'un intermediaire (passerelle Cloudflare en 521, page HTML
  // d'erreur...) : c'est une indisponibilite, pas une requete invalide.
  if (!isDatabaseAnswer || TRANSIENT_CODES.has(code)) {
    return new HistoriqueUnavailableError(UNAVAILABLE_MESSAGE);
  }

  const err = new HistoriqueError(error.message);
  err.code = code;
  return err;
}

// Message affichable a l'utilisateur pour n'importe quelle erreur remontee
// par la couche donnees.
export function describeHistoriqueError(err) {
  if (err instanceof HistoriqueUnavailableError) return "Donnees indisponibles : base hors ligne";
  if (err instanceof HistoriqueError) return err.message;
  return "Erreur de chargement";
}
