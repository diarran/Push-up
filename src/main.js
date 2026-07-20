import "./styles/app.css";
import { createVoiceCoach } from "./audio/coach.js";
import { createPoseLandmarker } from "./core/poseEngine.js";
import { loadGroupSession, saveGroupSession, clearGroupSession } from "./auth/groupGate.js";
import { renderGateScreen } from "./ui/screens/gate.js";
import { renderHomeScreen } from "./ui/screens/home.js";
import { renderSessionScreen } from "./ui/screens/session.js";
import { renderLeaderboardScreen } from "./ui/screens/leaderboard.js";

const root = document.getElementById("app");
const voiceCoach = createVoiceCoach();

let groupSession = loadGroupSession();
let cleanupCurrent = null;
let landmarkerPromise = null;

function getPoseLandmarker() {
  if (!landmarkerPromise) landmarkerPromise = createPoseLandmarker();
  return landmarkerPromise;
}

const ctx = {
  voiceCoach,
  getPoseLandmarker,
  navigate,
  getGroupSession: () => groupSession,
  setGroupSession(session) {
    groupSession = session;
    saveGroupSession(session);
  },
  logout() {
    groupSession = null;
    clearGroupSession();
    navigate("gate");
  }
};

function navigate(screen) {
  if (typeof cleanupCurrent === "function") cleanupCurrent();
  root.innerHTML = "";

  switch (screen) {
    case "session":
      cleanupCurrent = renderSessionScreen(root, ctx);
      break;
    case "leaderboard":
      cleanupCurrent = renderLeaderboardScreen(root, ctx);
      break;
    case "home":
      cleanupCurrent = renderHomeScreen(root, ctx);
      break;
    case "gate":
    default:
      cleanupCurrent = renderGateScreen(root, ctx);
  }
}

navigate(groupSession ? "home" : "gate");

// L'enregistrement du service worker est gere automatiquement par
// vite-plugin-pwa (registerType: "autoUpdate", injectRegister: "auto").
