// Signalements : un membre conteste une seance, l'administrateur tranche.
//
// Deposer un signalement est libre (simple insert, comme le reste du
// schema). Trancher ne l'est pas : ca passe par la fonction SQL
// trancher_signalement, qui exige le code administrateur et le verifie dans
// la base. Un membre qui bidouillerait la console n'obtiendrait rien de
// plus qu'un signalement de plus dans la file.

import { supabase, execute, ensureConfigured, isMissingFunction } from "./execute.js";
import { HistoriqueError } from "./errors.js";

export const TYPE_RECALCUL = "recalcul";
export const TYPE_ANNULATION = "annulation";

// Passe a false si la migration 0003 manque : les ecrans masquent alors
// tout ce qui touche aux signalements plutot que d'afficher des erreurs.
let moderationSupported = true;

export function isModerationSupported() {
  return moderationSupported;
}

function isMissingTable(err) {
  const code = err && err.code;
  const message = (err && err.message) || "";
  // PGRST205 : table inconnue de PostgREST. 42P01 : table absente cote
  // Postgres. Les deux signifient ici "migration 0003 pas executee".
  return code === "42P01" || (code === "PGRST205" && message.includes("signalements"));
}

function markUnsupported() {
  moderationSupported = false;
  console.warn(
    "Table signalements absente : moderation desactivee. " +
      "Executer supabase/migrations/0003_comptes_signalements_videos.sql pour l'activer."
  );
}

// Depose un signalement sur une seance.
//   type : "recalcul" (proposer un autre nombre de repetitions) ou
//          "annulation" (demander que la seance ne compte plus)
export async function reportSession({ sessionId, author, type, motif, proposedReps = null }) {
  ensureConfigured();
  if (type !== TYPE_RECALCUL && type !== TYPE_ANNULATION) {
    throw new HistoriqueError("Type de signalement invalide");
  }
  if (type === TYPE_RECALCUL && (proposedReps === null || proposedReps === undefined || proposedReps < 0)) {
    throw new HistoriqueError("Indique le nombre de repetitions que tu proposes");
  }

  try {
    await execute(
      supabase.from("signalements").insert({
        seance_id: sessionId,
        auteur: author,
        type,
        motif: String(motif || "").slice(0, 500),
        repetitions_proposees: type === TYPE_RECALCUL ? Math.round(proposedReps) : null
      })
    );
  } catch (err) {
    if (isMissingTable(err)) {
      markUnsupported();
      throw new HistoriqueError("Signalements indisponibles : migration 0003 non executee");
    }
    throw err;
  }
}

function mapReport(row) {
  return {
    id: row.id,
    sessionId: row.seance_id,
    author: row.auteur,
    type: row.type,
    motif: row.motif,
    proposedReps: row.repetitions_proposees,
    status: row.statut,
    decidedBy: row.decision_par,
    decidedAt: row.decision_at,
    createdAt: row.created_at
  };
}

const COLUMNS =
  "id, seance_id, auteur, type, motif, repetitions_proposees, statut, decision_par, decision_at, created_at";

// Tous les signalements, les plus recents d'abord. `status` filtre sur
// "en_attente" / "accepte" / "refuse" ; null renvoie tout.
export async function fetchReports(status = null, limit = 50) {
  ensureConfigured();
  try {
    let query = supabase.from("signalements").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
    if (status) query = query.eq("statut", status);
    const data = await execute(query);
    return (data || []).map(mapReport);
  } catch (err) {
    if (isMissingTable(err)) {
      markUnsupported();
      return [];
    }
    throw err;
  }
}

// Signalements portant sur les seances d'un pseudo donne, pour afficher
// "contestee" sur son profil. Passe par les identifiants de seance parce
// que la table ne porte pas le pseudo du proprietaire.
export async function fetchReportsForSessions(sessionIds) {
  ensureConfigured();
  const liste = (sessionIds || []).filter(Boolean);
  if (liste.length === 0) return new Map();

  try {
    const data = await execute(supabase.from("signalements").select(COLUMNS).in("seance_id", liste));
    const map = new Map();
    for (const row of data || []) {
      const report = mapReport(row);
      const current = map.get(report.sessionId) || [];
      current.push(report);
      map.set(report.sessionId, current);
    }
    return map;
  } catch (err) {
    if (isMissingTable(err)) {
      markUnsupported();
      return new Map();
    }
    throw err;
  }
}

// Decision de l'administrateur. `decision` vaut "accepte" ou "refuse" ;
// `reps` n'est utilise que pour accepter un recalcul (il remplace alors le
// nombre de repetitions de la seance).
export async function decideReport({ reportId, decision, reps = null, adminCode }) {
  ensureConfigured();
  try {
    await execute(
      supabase.rpc("trancher_signalement", {
        p_signalement_id: reportId,
        p_decision: decision,
        p_repetitions: reps === null || reps === undefined ? null : Math.round(reps),
        p_code_admin: String(adminCode || "")
      })
    );
  } catch (err) {
    if (isMissingFunction(err)) {
      markUnsupported();
      throw new HistoriqueError("Moderation indisponible : migration 0003 non executee");
    }
    throw err;
  }
}

// Suppression pure et simple d'une seance par l'administrateur (doublon,
// enregistrement rate). Distinct de l'annulation, qui garde la trace.
export async function deleteSessionAsAdmin(sessionId, adminCode) {
  ensureConfigured();
  try {
    await execute(
      supabase.rpc("supprimer_seance", { p_seance_id: sessionId, p_code_admin: String(adminCode || "") })
    );
  } catch (err) {
    if (isMissingFunction(err)) {
      markUnsupported();
      throw new HistoriqueError("Moderation indisponible : migration 0003 non executee");
    }
    throw err;
  }
}
