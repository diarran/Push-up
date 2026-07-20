import "./styles/app.css";
import { createVoiceCoach } from "./audio/coach.js";
import { createPoseLandmarker } from "./core/poseEngine.js";
import { loadUsername, saveUsername, clearUsername } from "./auth/groupGate.js";
import { renderGateScreen } from "./ui/screens/gate.js";
import { renderHomeScreen } from "./ui/screens/home.js";
import { renderWorkoutSetupScreen } from "./ui/screens/workoutSetup.js";
import { renderSessionScreen } from "./ui/screens/session.js";
import { renderLeaderboardScreen } from "./ui/screens/leaderboard.js";
import { renderProgressScreen } from "./ui/screens/progress.js";

const root = document.getElementById("app");
const voiceCoach = createVoiceCoach();

let username = loadUsername();
let cleanupCurrent = null;
let landmarkerPromise = null;
let muscleSelection = [];
let workoutPlan = null;
let navToken = 0;

function getPoseLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = createPoseLandmarker();
  return landmarkerPromise;
}

const ctx = {
  voiceCoach,
  getPoseLandmarker,
  navigate,
  getUsername: () => username,
  setUsername(value) {
    username = value;
    saveUsername(value);
  },
  logout() {
    username = null;
    clearUsername();
    navigate("gate");
  },
  getMuscleSelection: () => muscleSelection,
  setMuscleSelection(ids) {
    muscleSelection = ids;
  },
  getWorkoutPlan: () => workoutPlan,
  setWorkoutPlan(plan) {
    workoutPlan = plan;
  }
};

function navigate(screen) {
  const token = ++navToken;
  if (typeof cleanupCurrent === "function") cleanupCurrent();
  cleanupCurrent = null;
  root.innerHTML = "";

  function mount(renderFn) {
    // Une navigation plus recente a eu lieu pendant le chargement : on
    // abandonne ce montage pour ne pas ecraser l'ecran deja affiche.
    if (token !== navToken) return;
    cleanupCurrent = renderFn(root, ctx);
  }

  switch (screen) {
    case "targeting":
      // Three.js n'est utilise que par cet ecran : chargement a la demande
      // pour garder les autres ecrans legers.
      root.innerHTML = '<div class="screen loadingScreen"><p class="emptyState">Chargement</p></div>';
      import("./ui/screens/targeting.js").then((m) => mount(m.renderTargetingScreen));
      break;
    case "workoutSetup":
      cleanupCurrent = renderWorkoutSetupScreen(root, ctx);
      break;
    case "session":
      cleanupCurrent = renderSessionScreen(root, ctx);
      break;
    case "leaderboard":
      cleanupCurrent = renderLeaderboardScreen(root, ctx);
      break;
    case "progress":
      cleanupCurrent = renderProgressScreen(root, ctx);
      break;
    case "home":
      cleanupCurrent = renderHomeScreen(root, ctx);
      break;
    case "gate":
    default:
      cleanupCurrent = renderGateScreen(root, ctx);
  }
}

navigate(username ? "home" : "gate");

// L'enregistrement du service worker est gere automatiquement par
// vite-plugin-pwa (registerType: "autoUpdate", injectRegister: "auto").
