// Comptes : code PIN, administration, suppression.
//
// Tout passe par des fonctions SQL SECURITY DEFINER (migration 0003) : le
// hash du code n'est jamais renvoye au navigateur, et la verification se
// fait dans la base. Ca change du reste de la couche donnees, ou le client
// tape directement dans les tables ; c'est justement parce qu'un secret
// verifie cote client ne protege de rien.
//
// Si la migration 0003 n'a pas encore ete executee, les fonctions n'existent
// pas : on bascule alors en "mode sans code" (comportement d'avant, entree
// au pseudo seul) plutot que de bloquer l'acces a l'application.

import { supabase, execute, ensureConfigured, isMissingFunction, isMissingColumn } from "./execute.js";
import { HistoriqueError } from "./errors.js";

export const PIN_PATTERN = /^[0-9]{4,6}$/;
export const ADMIN_USERNAME = "Admin";

// Passe a false des qu'un appel revele que la migration 0003 manque, pour
// ne pas retenter a chaque ecran.
let pinSupported = true;

// Levee quand la migration 0003 manque : les ecrans la traitent comme
// "continuer sans code", pas comme une erreur a afficher.
export class PinNotSupportedError extends HistoriqueError {}

async function rpc(name, args) {
  try {
    return await execute(supabase.rpc(name, args));
  } catch (err) {
    if (isMissingFunction(err)) {
      pinSupported = false;
      console.warn(
        `Fonction ${name} absente : les codes PIN et la moderation sont desactives. ` +
          "Executer supabase/migrations/0003_comptes_signalements_videos.sql pour les activer."
      );
      throw new PinNotSupportedError("Codes PIN non installes");
    }
    throw err;
  }
}

// Etat d'un pseudo avant l'entree : le compte existe-t-il, a-t-il un code,
// est-ce celui de l'administrateur ?
export async function fetchAccountState(pseudo) {
  ensureConfigured();
  const rows = await rpc("etat_compte", { p_pseudo: pseudo });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    exists: Boolean(row && row.existe),
    hasPin: Boolean(row && row.a_un_code),
    isAdmin: Boolean(row && row.est_admin),
    // Absent tant que la migration 0004 n'est pas passee : on ne peut
    // alors pas prevenir qu'un compte a deja un historique, mais rien ne
    // casse pour autant.
    sessionCount: row && typeof row.nb_seances === "number" ? row.nb_seances : null
  };
}

export function isValidPin(code) {
  return PIN_PATTERN.test(String(code || ""));
}

// Cree le compte (s'il n'existe pas) et lui attache un code. La base refuse
// d'ecraser un code deja pose.
export async function setPin(pseudo, code) {
  ensureConfigured();
  if (!isValidPin(code)) throw new HistoriqueError("Le code doit contenir de 4 a 6 chiffres");
  await rpc("definir_code_pin", { p_pseudo: pseudo, p_code: String(code) });
}

export async function verifyPin(pseudo, code) {
  ensureConfigured();
  const ok = await rpc("verifier_code_pin", { p_pseudo: pseudo, p_code: String(code) });
  return ok === true;
}

export async function changePin(pseudo, ancien, nouveau) {
  ensureConfigured();
  if (!isValidPin(nouveau)) throw new HistoriqueError("Le nouveau code doit contenir de 4 a 6 chiffres");
  await rpc("modifier_code_pin", { p_pseudo: pseudo, p_ancien: String(ancien), p_nouveau: String(nouveau) });
}

// Liste des comptes (lecture libre, comme le classement). `est_admin` n'est
// pas connue des bases ou la migration 0003 manque : on la lit a part.
export async function fetchUsers() {
  ensureConfigured();
  try {
    const data = await execute(supabase.from("utilisateurs").select("pseudo, est_admin, created_at"));
    return (data || []).map((row) => ({
      username: row.pseudo,
      isAdmin: Boolean(row.est_admin),
      createdAt: row.created_at
    }));
  } catch (err) {
    if (!isMissingColumn(err, "est_admin")) throw err;
    const data = await execute(supabase.from("utilisateurs").select("pseudo, created_at"));
    return (data || []).map((row) => ({ username: row.pseudo, isAdmin: false, createdAt: row.created_at }));
  }
}

// Supprime le compte et tout son historique (cascade). Renvoie les chemins
// des videos a effacer du Storage : la base ne sait pas supprimer des
// fichiers, c'est a l'appelant de le faire.
export async function deleteAccount(pseudo, code) {
  ensureConfigured();
  const rows = await rpc("supprimer_compte", { p_pseudo: pseudo, p_code: String(code || "") });
  return (rows || []).map((row) => (typeof row === "string" ? row : row.video_path)).filter(Boolean);
}
