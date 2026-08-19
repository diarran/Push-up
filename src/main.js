import "./styles/app.css";
import { createVoiceCoach } from "./audio/coach.js";
import { createPoseLandmarker } from "./core/poseEngine.js";
import { loadUsername, saveUsername, clearUsername, loadIsAdmin, saveIsAdmin } from "./auth/groupGate.js";
import { renderGateScreen } from "./ui/screens/gate.js";
import { renderHomeScreen } from "./ui/screens/home.js";
import { renderWorkoutSetupScreen } from "./ui/screens/workoutSetup.js";
import { renderSessionScreen } from "./ui/screens/session.js";
import { renderLeaderboardScreen } from "./ui/screens/leaderboard.js";
import { renderProgressScreen } from "./ui/screens/progress.js";
import { renderProfileScreen } from "./ui/screens/profile.js";

const root = document.getElementById("app");
const voiceCoach = createVoiceCoach();

let username = loadUsername();
let isAdmin = loadIsAdmin();
let cleanupCurrent = null;
let landmarkerPromise = null;
let muscleSelection = [];
let workoutPlan = null;
let navToken = 0;
let profileTarget = null;
// Code administrateur : garde en memoire vive uniquement, le temps de la
// visite. Jamais dans localStorage, et de toute facon revalide par la base
// a chaque action de moderation.
let adminCode = null;

function getPoseLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = createPoseLandmarker();
  return landmarkerPromise;
}

const ctx = {
  voiceCoach,
  getPoseLandmarker,
  navigate,
  getUsername: () => username,
  setUsername(value, { isAdmin: admin = false } = {}) {
    username = value;
    isAdmin = admin;
    saveUsername(value);
    saveIsAdmin(admin);
  },
  logout() {
    username = null;
    isAdmin = false;
    adminCode = null;
    clearUsername();
    navigate("gate");
  },
  isAdmin: () => isAdmin,
  getAdminCode: () => adminCode,
  setAdminCode(code) {
    adminCode = code;
  },
  // Profil affiche par l'ecran "profile" (ouvert depuis le classement).
  getProfileTarget: () => profileTarget,
  setProfileTarget(value) {
    profileTarget = value;
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

  function mount(renderFn, options) {
    // Une navigation plus recente a eu lieu pendant le chargement : on
    // abandonne ce montage pour ne pas ecraser l'ecran deja affiche.
    if (token !== navToken) return;
    cleanupCurrent = renderFn(root, ctx, options);
  }

  switch (screen) {
    case "targeting":
      // Three.js n'est utilise que par cet ecran : chargement a la demande
      // pour garder les autres ecrans legers.
      root.innerHTML = '<div class="screen loadingScreen"><p class="emptyState">Chargement</p></div>';
      import("./ui/screens/targeting.js").then((m) => mount(m.renderTargetingScreen));
      break;
    case "bodyViewer":
      // Meme ecran que le ciblage, en simple visionneuse : le parcours etant
      // reduit aux pompes, la selection de muscles ne mene nulle part pour
      // l'instant (voir README, "Parcours reduit aux pompes").
      root.innerHTML = '<div class="screen loadingScreen"><p class="emptyState">Chargement</p></div>';
      import("./ui/screens/targeting.js").then((m) => mount(m.renderTargetingScreen, { viewerOnly: true }));
      break;
    case "tutorial":
      // Meme raison qu'au-dessus : Three.js charge a la demande.
      root.innerHTML = '<div class="screen loadingScreen"><p class="emptyState">Chargement</p></div>';
      import("./ui/screens/tutorial.js").then((m) => mount(m.renderTutorialScreen));
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
    case "profile":
      cleanupCurrent = renderProfileScreen(root, ctx);
      break;
    case "admin":
      // Ecran rarement ouvert (un seul compte y a acces) : charge a la
      // demande pour ne pas alourdir le bundle de tout le monde.
      root.innerHTML = '<div class="screen loadingScreen"><p class="emptyState">Chargement</p></div>';
      import("./ui/screens/admin.js").then((m) => mount(m.renderAdminScreen));
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
