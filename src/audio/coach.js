import {
  START_LINES,
  ENCOURAGEMENT_LINES,
  sessionEndLine,
  exerciseIntroLine,
  nextExerciseLine,
  workoutCompleteLine
} from "./messages.js";

const POSTURE_COOLDOWN_MS = 5000;
const ENCOURAGEMENT_INTERVAL_MS = 20000;
const MAX_QUEUE_LENGTH = 3;

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Coach vocal base sur la Web Speech API. Gere une file d'attente courte,
// un anti-spam par cooldown (par type de message) et des encouragements
// declenches uniquement pendant les temps morts de l'effort.
export function createVoiceCoach() {
  const synth = window.speechSynthesis || null;
  const supported = Boolean(synth && "SpeechSynthesisUtterance" in window);

  let voice = null;
  let queue = [];
  let speaking = false;
  // Coach vocal suspendu pour le moment : desactive par defaut, toutes les
  // annonces deviennent des no-ops. Repasser a `supported` (et remettre le
  // bouton son dans l'ecran de seance) pour le reactiver.
  let enabled = false;
  const lastSpokenAt = new Map();
  let lastEncouragementAt = 0;

  function pickVoice() {
    if (!synth) return;
    try {
      const voices = synth.getVoices();
      voice = voices.find((v) => v.lang === "fr-FR") || voices.find((v) => v.lang?.startsWith("fr")) || voices[0] || null;
    } catch (err) {
      console.error("Coach vocal : impossible de lister les voix", err);
    }
  }

  if (supported) {
    pickVoice();
    synth.addEventListener("voiceschanged", pickVoice);
  }

  // La Web Speech API est connue pour etre peu fiable sur Safari iOS,
  // notamment lorsqu'un appel intervient plusieurs "await" apres le geste
  // utilisateur d'origine (ex. apres le chargement du modele de pose).
  // Ce module ne doit jamais laisser une erreur de synthese vocale
  // remonter a l'appelant : la voix est une aide, pas une dependance dont
  // la seance depend pour avancer (decompte de repos, changement de serie).
  function processQueue() {
    if (!enabled || speaking || queue.length === 0) return;
    const next = queue.shift();

    try {
      const utterance = new SpeechSynthesisUtterance(next.text);
      utterance.lang = "fr-FR";
      if (voice) utterance.voice = voice;
      utterance.rate = 1.02;
      utterance.pitch = 1;

      speaking = true;
      utterance.onend = () => {
        speaking = false;
        processQueue();
      };
      utterance.onerror = () => {
        speaking = false;
        processQueue();
      };
      synth.speak(utterance);
    } catch (err) {
      console.error("Coach vocal : echec de la synthese vocale", err);
      speaking = false;
    }
  }

  function enqueue(text, { code = null, cooldownMs = 0 } = {}) {
    if (!enabled || !text) return;

    if (code) {
      const last = lastSpokenAt.get(code) || 0;
      if (Date.now() - last < cooldownMs) return;
      lastSpokenAt.set(code, Date.now());
    }

    if (queue.length >= MAX_QUEUE_LENGTH) queue.shift();
    queue.push({ text });
    processQueue();
  }

  function clearQueue() {
    queue = [];
    speaking = false;
    try {
      if (synth) synth.cancel();
    } catch (err) {
      console.error("Coach vocal : echec de l'annulation", err);
    }
  }

  function setEnabled(value) {
    enabled = value && supported;
    if (!enabled) clearQueue();
  }

  function announceSessionStart() {
    clearQueue();
    lastEncouragementAt = Date.now();
    enqueue(pickRandom(START_LINES), { code: "session_start" });
  }

  function announceRepCount(count) {
    enqueue(String(count), { code: "rep_count" });
  }

  // code attendu : "go_lower" | "lock_out" | "hip_sag"
  function announcePosture(code, message) {
    enqueue(message, { code, cooldownMs: POSTURE_COOLDOWN_MS });
  }

  // A appeler regulierement (ex. a chaque frame) : ne parle que si la file est
  // vide et qu'assez de temps s'est ecoule depuis le dernier encouragement,
  // pour ne jamais couvrir un decompte ou une alerte de posture.
  function maybeEncourage() {
    if (!enabled || speaking || queue.length > 0) return;
    if (Date.now() - lastEncouragementAt < ENCOURAGEMENT_INTERVAL_MS) return;
    lastEncouragementAt = Date.now();
    enqueue(pickRandom(ENCOURAGEMENT_LINES), { code: "encouragement" });
  }

  function announceSessionEnd(totalReps) {
    clearQueue();
    enqueue(sessionEndLine(totalReps), { code: "session_end" });
  }

  // Transitions d'une seance multi-exercices : chacune coupe la parole en
  // cours (clearQueue) car elle marque un changement de contexte net.
  function announceExerciseIntro(label, setIndex, totalSets) {
    clearQueue();
    lastEncouragementAt = Date.now();
    enqueue(exerciseIntroLine(label, setIndex, totalSets), { code: "exercise_intro" });
  }

  function announceNextExercise(label) {
    enqueue(nextExerciseLine(label), { code: "next_exercise" });
  }

  function announceWorkoutComplete(exerciseCount) {
    clearQueue();
    enqueue(workoutCompleteLine(exerciseCount), { code: "workout_complete" });
  }

  // Safari iOS n'autorise la synthese vocale qu'apres un premier appel a
  // speak() intervenu de facon synchrone dans un geste utilisateur (clic).
  // Le premier message reel de la seance arrive plusieurs "await" plus tard
  // (camera, chargement du modele) : trop tard pour etre rattache au
  // geste. A appeler directement dans le gestionnaire de clic qui lance la
  // seance, avant tout traitement asynchrone.
  function unlock() {
    if (!enabled) return;
    try {
      const utterance = new SpeechSynthesisUtterance(" ");
      utterance.volume = 0;
      synth.speak(utterance);
    } catch (err) {
      console.error("Coach vocal : echec du deblocage audio", err);
    }
  }

  return {
    setEnabled,
    unlock,
    announceSessionStart,
    announceRepCount,
    announcePosture,
    maybeEncourage,
    announceSessionEnd,
    announceExerciseIntro,
    announceNextExercise,
    announceWorkoutComplete,
    stop: clearQueue,
    get supported() {
      return supported;
    },
    get enabled() {
      return enabled;
    }
  };
}
