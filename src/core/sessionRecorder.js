// Enregistrement video de la seance, a partir du canvas de rendu.
//
// On filme le canvas et non le flux camera brut : le canvas porte deja
// l'image de la camera ET le squelette detecte. La video montre donc a la
// fois la personne et ce que le compteur a reellement vu, ce qui est le
// seul moyen de trancher un signalement ("cette pompe n'etait pas
// complete") sans se fier a la parole de chacun.
//
// Reglages volontairement modestes (15 images/s, debit reduit) : une seance
// de plusieurs minutes doit rester de l'ordre de quelques megaoctets, sinon
// personne ne l'enverra depuis un telephone en 4G.

const FPS = 15;
const BITS_PER_SECOND = 800_000;
const MAX_DURATION_MS = 15 * 60 * 1000;

// Ordre de preference : les navigateurs ne supportent pas les memes codecs
// (webm/vp9 partout sauf Safari, mp4/h264 sur Safari recent).
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4"
];

export function isRecordingSupported() {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

function pickMimeType() {
  if (typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

// Demarre l'enregistrement du canvas. Renvoie un objet avec stop(), qui
// resout sur le Blob complet, et cancel() pour tout jeter.
//
// Renvoie null si le navigateur ne sait pas enregistrer : la seance se
// deroule alors normalement, simplement sans video.
export function startSessionRecording(canvas) {
  if (!isRecordingSupported()) return null;

  let stream;
  try {
    stream = canvas.captureStream(FPS);
  } catch (err) {
    console.warn("Capture du canvas impossible : seance sans video", err);
    return null;
  }

  const mimeType = pickMimeType();
  let recorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: BITS_PER_SECOND } : undefined);
  } catch (err) {
    console.warn("MediaRecorder indisponible : seance sans video", err);
    return null;
  }

  const chunks = [];
  let cancelled = false;
  let stopped = false;

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });

  // Un morceau par seconde : sans cela, certains navigateurs ne rendent
  // les donnees qu'a l'arret, et une coupure en cours de seance perd tout.
  recorder.start(1000);

  function releaseStream() {
    clearTimeout(limitId);
    stream.getTracks().forEach((track) => track.stop());
  }

  // Garde-fou : une seance oubliee ne doit pas remplir la memoire du
  // telephone. Au-dela de la limite, on arrete d'accumuler - et on coupe
  // aussi la capture du canvas, sinon la piste reste vivante jusqu'a la
  // fermeture de l'onglet (temoin d'enregistrement allume sur certains
  // navigateurs) alors que plus personne ne l'ecoute.
  const limitId = setTimeout(() => {
    if (recorder.state === "recording") recorder.stop();
    releaseStream();
  }, MAX_DURATION_MS);

  return {
    get active() {
      return recorder.state === "recording";
    },

    // Arrete et renvoie la video complete (null si annulee ou vide).
    stop() {
      if (stopped) return Promise.resolve(null);
      stopped = true;

      return new Promise((resolve) => {
        recorder.addEventListener(
          "stop",
          () => {
            releaseStream();
            if (cancelled || chunks.length === 0) {
              resolve(null);
              return;
            }
            resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }));
          },
          { once: true }
        );

        if (recorder.state === "inactive") {
          // Deja arrete (limite de duree atteinte) : l'evenement "stop" est
          // passe, on reconstruit directement le blob.
          releaseStream();
          resolve(cancelled || chunks.length === 0 ? null : new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" }));
          return;
        }
        recorder.stop();
      });
    },

    cancel() {
      cancelled = true;
      chunks.length = 0;
      if (recorder.state !== "inactive") recorder.stop();
      releaseStream();
    }
  };
}
