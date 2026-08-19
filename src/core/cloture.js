// Regle de cloture d'une seance : a partir de quand n'est-elle plus
// contestable, donc sa video effacable ?
//
// Module volontairement pur (aucun import, aucun acces reseau) pour rester
// testable hors navigateur - le reste de la couche donnees tire le client
// Supabase, qui depend de variables d'environnement Vite.
//
// La regle existe deux fois : ici pour l'affichage, et en SQL
// (`seance_close`, migration 0005) pour la purge. C'est la version SQL qui
// fait foi - un client ne decide pas de ce qu'il peut effacer - mais les
// deux doivent rester alignees, d'ou les constantes ci-dessous, qui
// reprennent `parametres_cloture()`.

export const VALIDATIONS_REQUISES = 2;
export const DELAI_CLOTURE_JOURS = 7;

const JOUR_MS = 24 * 60 * 60 * 1000;

// Une seance est close quand le delai est passe OU que le groupe l'a
// validee - mais jamais tant qu'un signalement est en attente : la video
// doit survivre jusqu'a la decision de l'administrateur, sinon la preuve
// disparaitrait au moment precis ou elle sert.
export function isSessionClosed({ createdAt, validationCount = 0, hasPendingReport = false }) {
  if (hasPendingReport) return false;
  if (validationCount >= VALIDATIONS_REQUISES) return true;

  const age = Date.now() - new Date(createdAt).getTime();
  return Number.isFinite(age) && age >= DELAI_CLOTURE_JOURS * JOUR_MS;
}
