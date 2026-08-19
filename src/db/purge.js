// Purge des videos de seances closes.
//
// L'application n'a pas de serveur : rien ne tourne tout seul pour faire le
// menage. La purge est donc opportuniste - elle se declenche au demarrage,
// au plus une fois par jour et par appareil. Avec un groupe qui ouvre
// l'application regulierement, ca suffit largement, et ca evite d'ajouter
// une infrastructure (pg_cron, fonction planifiee) pour effacer quelques
// fichiers.
//
// Deroulement en deux temps, pour qu'une interruption ne perde jamais le
// chemin d'un fichier :
//   1. la base designe les videos purgeables (videos_a_purger)
//   2. l'application les supprime du Storage
//   3. la base detache celles qui sont bien parties (confirmer_purge_videos)
// Une video supprimee mais non confirmee sera simplement reproposee au
// passage suivant.

import { supabase, execute, ensureConfigured, isMissingFunction } from "./execute.js";
import { deleteSessionVideos } from "./videos.js";

const DERNIERE_PURGE_KEY = "bsePushUp.dernierePurge.v1";
const INTERVALLE_MS = 24 * 60 * 60 * 1000;
const LOT_MAX = 50;

function dernierePurge() {
  try {
    return Number(localStorage.getItem(DERNIERE_PURGE_KEY)) || 0;
  } catch (err) {
    return 0;
  }
}

function marquerPurge() {
  try {
    localStorage.setItem(DERNIERE_PURGE_KEY, String(Date.now()));
  } catch (err) {
    /* stockage indisponible : la purge sera simplement retentee */
  }
}

// Effectue une passe de purge. Renvoie le nombre de videos effacees.
export async function purgeClosedVideos() {
  ensureConfigured();

  let cibles;
  try {
    cibles = await execute(supabase.rpc("videos_a_purger", { p_limite: LOT_MAX }));
  } catch (err) {
    if (isMissingFunction(err)) {
      console.warn(
        "Purge indisponible : executer supabase/migrations/0005_validation_et_purge.sql pour l'activer."
      );
      return 0;
    }
    throw err;
  }

  const liste = (cibles || []).filter((row) => row && row.video_path);
  if (liste.length === 0) return 0;

  const supprimes = new Set(await deleteSessionVideos(liste.map((row) => row.video_path)));
  // Seuls les fichiers reellement partis sont confirmes : les autres seront
  // reproposes au prochain passage.
  const confirmables = liste.filter((row) => supprimes.has(row.video_path)).map((row) => row.id);
  if (confirmables.length === 0) return 0;

  await execute(supabase.rpc("confirmer_purge_videos", { p_ids: confirmables }));
  return confirmables.length;
}

// Purge au demarrage, au plus une fois par jour et par appareil. Ne leve
// jamais : le menage ne doit pas empecher l'application de s'ouvrir.
export function schedulePurge() {
  if (Date.now() - derniereePurge() < INTERVALLE_MS) return;
  marquerPurge();

  purgeClosedVideos()
    .then((total) => {
      if (total > 0) console.info(`Purge : ${total} video(s) de seances closes effacee(s).`);
    })
    .catch((err) => console.warn("Purge des videos impossible", err));
}
