import { PoseLandmarker, DrawingUtils } from "../../core/poseEngine.js";
import { startCameraStream, stopCameraStream } from "../../core/cameraStream.js";
import { createRepCounter } from "../../core/repCounter.js";
import { pickSide } from "../../core/landmarks.js";
import { angleAt, areVisible } from "../../core/geometry.js";
import { submitSession } from "../../db/historique.js";

const VIS_THRESHOLD = 0.55;
const ALIGN_ANGLE = 160;

export function renderSessionScreen(root, ctx) {
  const username = ctx.getUsername();
  const voiceCoach = ctx.voiceCoach;

  const el = document.createElement("div");
  el.className = "screen sessionScreen";
  el.innerHTML = `
    <video id="video" playsinline muted autoplay></video>
    <canvas id="output"></canvas>
    <div class="hud">
      <div class="topBar">
        <div class="counterBox">
          <div class="counter" id="counter">0</div>
          <div class="counterLabel">Repetitions</div>
        </div>
        <div class="topRight">
          <button id="endBtn" class="dangerPill">Terminer</button>
          <button id="voiceToggle" class="ghostPill"></button>
          <button id="debugToggle" class="ghostPill">Debug</button>
          <div id="debugBox" class="debugBox"></div>
        </div>
      </div>
      <div class="bottomArea">
        <div id="messageBanner" class="messageBanner neutral">Chargement du modele</div>
        <div id="stagePill" class="stagePill">Phase : haut</div>
      </div>
    </div>
  `;
  root.appendChild(el);

  const video = el.querySelector("#video");
  const canvas = el.querySelector("#output");
  const ctx2d = canvas.getContext("2d");
  const counterEl = el.querySelector("#counter");
  const messageBanner = el.querySelector("#messageBanner");
  const stagePill = el.querySelector("#stagePill");
  const debugBox = el.querySelector("#debugBox");
  const debugToggle = el.querySelector("#debugToggle");
  const endBtn = el.querySelector("#endBtn");
  const voiceToggle = el.querySelector("#voiceToggle");

  const repCounter = createRepCounter();
  let landmarker = null;
  let drawingUtils = null;
  let active = false;
  let canvasReady = false;
  let lastVideoTime = -1;
  let rafId = null;
  let ended = false;

  function setMessage(text, type) {
    messageBanner.textContent = text;
    messageBanner.className = `messageBanner ${type}`;
  }

  function setStagePill(stage) {
    stagePill.textContent = `Phase : ${stage === "up" ? "haut" : "bas"}`;
  }

  function updateVoiceToggle() {
    voiceToggle.textContent = voiceCoach.enabled ? "Voix : active" : "Voix : coupee";
  }
  updateVoiceToggle();

  debugToggle.addEventListener("click", () => debugBox.classList.toggle("visible"));
  voiceToggle.addEventListener("click", () => {
    voiceCoach.setEnabled(!voiceCoach.enabled);
    updateVoiceToggle();
  });

  function ensureCanvasSize() {
    if (canvasReady) return;
    if (video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvasReady = true;
    }
  }

  function processResult(result) {
    ensureCanvasSize();
    if (!canvasReady) return;

    ctx2d.save();
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);

    const lms = result.landmarks && result.landmarks[0];

    if (!lms) {
      setMessage("Mets-toi dans le cadre", "neutral");
      ctx2d.restore();
      return;
    }

    drawingUtils.drawConnectors(lms, PoseLandmarker.POSE_CONNECTIONS, { color: "#00e676", lineWidth: 3 });
    drawingUtils.drawLandmarks(lms, { color: "#ffffff", radius: 3 });

    const side = pickSide(lms);
    if (!areVisible([side.shoulder, side.elbow, side.wrist, side.hip, side.ankle], VIS_THRESHOLD)) {
      setMessage("Recule-toi, corps entier visible", "neutral");
      ctx2d.restore();
      return;
    }

    const elbowAngle = angleAt(side.shoulder, side.elbow, side.wrist);
    const alignAngle = angleAt(side.shoulder, side.hip, side.ankle);
    const alignOk = alignAngle >= ALIGN_ANGLE;

    debugBox.innerHTML = `Coude : ${elbowAngle.toFixed(0)} deg<br>Bassin : ${alignAngle.toFixed(0)} deg`;

    const status = repCounter.evaluate(elbowAngle, alignOk);
    setMessage(status.message, status.type);
    setStagePill(status.stage);

    if (status.repCompleted) {
      counterEl.textContent = status.count;
      voiceCoach.announceRepCount(status.count);
    } else if (status.type === "warning") {
      voiceCoach.announcePosture(status.code, status.message);
    }
    voiceCoach.maybeEncourage();

    ctx2d.restore();
  }

  function renderLoop() {
    if (!active) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = landmarker.detectForVideo(video, performance.now());
      processResult(result);
    }
    rafId = requestAnimationFrame(renderLoop);
  }

  async function start() {
    try {
      await startCameraStream(video, { facingMode: "user", width: 720, height: 1280 });
      landmarker = await ctx.getPoseLandmarker();
      drawingUtils = new DrawingUtils(ctx2d);

      active = true;
      setMessage("Mets-toi dans le cadre", "neutral");
      voiceCoach.announceSessionStart();
      renderLoop();
    } catch (err) {
      console.error(err);
      setMessage("Impossible de demarrer la camera ou le modele", "warning");
    }
  }

  function cleanup() {
    if (!active && rafId === null) return;
    active = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    stopCameraStream(video);
  }

  async function finish() {
    if (ended) return;
    ended = true;

    const finalCount = repCounter.count;
    cleanup();
    voiceCoach.announceSessionEnd(finalCount);

    if (finalCount > 0) {
      try {
        await submitSession({ username, reps: finalCount });
      } catch (err) {
        console.error("Enregistrement de la seance impossible", err);
      }
    }

    ctx.navigate("home");
  }

  endBtn.addEventListener("click", finish);

  start();

  return cleanup;
}
