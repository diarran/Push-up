// Validation des seances par le groupe.
//
// Une seance validee par assez de membres devient close : elle n'est plus
// contestable et sa video peut etre purgee, sans attendre le delai de 7
// jours. C'est le pendant "positif" du signalement.

import { supabase, execute, ensureConfigured, isMissingFunction, isMissingTable } from "./execute.js";
import { HistoriqueError } from "./errors.js";

// La regle de cloture elle-meme vit dans src/core/cloture.js : elle ne
// depend de rien et reste ainsi testable hors navigateur. Reexportee ici
// pour que les ecrans n'aient qu'un seul point d'entree.
export { isSessionClosed, VALIDATIONS_REQUISES, DELAI_CLOTURE_JOURS } from "../core/cloture.js";

let validationSupported = true;

export function isValidationSupported() {
  return validationSupported;
}

function tableAbsente(err) {
  return isMissingTable(err, "validations");
}

function markUnsupported() {
  validationSupported = false;
  console.warn(
    "Validations indisponibles : executer supabase/migrations/0005_validation_et_purge.sql pour les activer."
  );
}

// Renvoie une Map seanceId -> [pseudos ayant valide].
export async function fetchValidationsForSessions(sessionIds) {
  ensureConfigured();
  const liste = (sessionIds || []).filter(Boolean);
  if (liste.length === 0) return new Map();

  try {
    const data = await execute(
      supabase.from("validations").select("seance_id, auteur").in("seance_id", liste)
    );
    const map = new Map();
    for (const row of data || []) {
      const current = map.get(row.seance_id) || [];
      current.push(row.auteur);
      map.set(row.seance_id, current);
    }
    return map;
  } catch (err) {
    if (tableAbsente(err)) {
      markUnsupported();
      return new Map();
    }
    throw err;
  }
}

export async function validateSession(sessionId, author) {
  ensureConfigured();
  try {
    await execute(supabase.rpc("valider_seance", { p_seance_id: sessionId, p_auteur: author }));
  } catch (err) {
    if (isMissingFunction(err)) {
      markUnsupported();
      throw new HistoriqueError("Validation indisponible : migration 0005 non executee");
    }
    throw err;
  }
}
