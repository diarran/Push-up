import { START_LINES, ENCOURAGEMENT_LINES, sessionEndLine } from "./messages.js";

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
  let enabled = supported;
  const lastSpokenAt = new Map();
  let lastEncouragementAt = 0;

  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    voice = voices.find((v) => v.lang === "fr-FR") || voices.find((v) => v.lang?.startsWith("fr")) || voices[0] || null;
  }

  if (supported) {
    pickVoice();
    synth.addEventListener("voiceschanged", pickVoice);
  }

  function processQueue() {
    if (!enabled || speaking || queue.length === 0) return;
    const next = queue.shift();
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
    if (synth) synth.cancel();
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

  return {
    setEnabled,
    announceSessionStart,
    announceRepCount,
    announcePosture,
    maybeEncourage,
    announceSessionEnd,
    stop: clearQueue,
    get supported() {
      return supported;
    },
    get enabled() {
      return enabled;
    }
  };
}
