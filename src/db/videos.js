// Videos de seance : depot dans le bucket Storage "seances" et lecture.
//
// La video sert a verifier une performance contestee (voir l'ecran de
// profil et les signalements). Elle est enregistree depuis le canvas de la
// seance, squelette compris : on voit donc a la fois la personne et ce que
// le detecteur a reellement suivi.

import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import { HistoriqueUnavailableError } from "./errors.js";

const BUCKET = "seances";

// Chemin : un dossier par pseudo (menage plus simple), un nom de fichier
// aleatoire (une video n'est pas devinable a partir d'un pseudo).
function buildPath(username, extension) {
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  const dossier = encodeURIComponent(username).replaceAll("%", "_");
  return `${dossier}/${id}.${extension}`;
}

function extensionFor(mimeType) {
  return String(mimeType || "").includes("mp4") ? "mp4" : "webm";
}

// Depose la video et renvoie son chemin dans le bucket. Renvoie null si
// Supabase n'est pas configure : une seance sans video reste une seance
// valable, on ne fait pas echouer l'enregistrement pour autant.
export async function uploadSessionVideo(blob, username) {
  if (!isSupabaseConfigured || !blob || blob.size === 0) return null;

  const path = buildPath(username, extensionFor(blob.type));
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "video/webm",
    upsert: false
  });

  if (error) {
    // Bucket absent : la migration 0003 n'a pas ete executee, ou le bucket
    // a ete supprime. Sans video la seance reste comptee, on le signale
    // simplement dans la console.
    throw new HistoriqueUnavailableError(
      /not found|bucket/i.test(error.message || "")
        ? "Bucket \"seances\" absent : video non enregistree"
        : `Video non enregistree : ${error.message}`
    );
  }

  return path;
}

// URL publique d'une video (bucket public, voir migration 0003).
export function sessionVideoUrl(path) {
  if (!isSupabaseConfigured || !path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data ? data.publicUrl : null;
}

// Effacement au mieux : utilise a la suppression d'un compte. Un echec ici
// laisse un fichier orphelin, ce qui est sans consequence fonctionnelle.
export async function deleteSessionVideos(paths) {
  const liste = (paths || []).filter(Boolean);
  if (!isSupabaseConfigured || liste.length === 0) return;
  try {
    await supabase.storage.from(BUCKET).remove(liste);
  } catch (err) {
    console.warn("Videos non supprimees du Storage", err);
  }
}
