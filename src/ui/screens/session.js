import { PoseLandmarker, DrawingUtils } from "../../core/poseEngine.js";
import { startCameraStream, stopCameraStream } from "../../core/cameraStream.js";
import { createExerciseEngine } from "../../core/exercises/exerciseEngine.js";
import { getExercise } from "../../core/exercises/index.js";
import { submitWorkoutResults } from "../../db/historique.js";
import { withTimeout } from "../../core/withTimeout.js";
import { muscleLabel } from "../../biomechanics/muscleGroups.js";
import { REST_SECONDS } from "../../workout/generator.js";

const SUBMIT_TIMEOUT_MS = 6000;
const FLASH_DURATION_MS = 380;

export function renderSessionScreen(root, ctx) {
  const username = ctx.getUsername();
  const voiceCoach = ctx.voiceCoach;
  const plan = ctx.getWorkoutPlan();

  if (!plan || plan.length === 0) {
    ctx.navigate("home");
    return () => {};
  }

  const el = document.createElement("div");
  el.className = "screen sessionScreen";
  el.innerHTML = `
    <video id="video" playsinline muted autoplay></video>
    <canvas id="output"></canvas>
    <div id="repFlash" class="repFlash"></div>
    <div class="hud">
      <div class="topBar">
        <div class="counterBox">
          <div class="exerciseLabel" id="exerciseLabel"></div>
          <div class="counter" id="counter">0</div>
          <div class="counterLabel" id="counterLabel">Repetitions</div>
        </div>
        <div class="topRight">
          <button id="endBtn" class="dangerPill">Terminer</button>
          <button id="soundToggle" class="ghostPill"></button>
          <button id="debugToggle" class="ghostPill">Debug</button>
          <div id="debugBox" class="debugBox"></div>
        </div>
      </div>
      <div class="bottomArea">
        <div id="messageBanner" class="messageBanner neutral">Chargement du modele</div>
        <div id="stagePill" class="stagePill"></div>
      </div>
    </div>
    <div id="restOverlay" class="restOverlay" hidden>
      <div class="restLabel">Repos</div>
      <div class="restCountdown" id="restCountdown">0</div>
      <div class="restNext" id="restNext"></div>
    </div>
  `;
  root.appendChild(el);

  const video = el.querySelector("#video");
  const canvas = el.querySelector("#output");
  const ctx2d = canvas.getContext("2d");
  const repFlash = el.querySelector("#repFlash");
  const exerciseLabelEl = el.querySelector("#exerciseLabel");
  const counterEl = el.querySelector("#counter");
  const counterLabelEl = el.querySelector("#counterLabel");
  const messageBanner = el.querySelector("#messageBanner");
  const stagePill = el.querySelector("#stagePill");
  const debugBox = el.querySelector("#debugBox");
  const debugToggle = el.querySelector("#debugToggle");
  const endBtn = el.querySelector("#endBtn");
  const soundToggle = el.querySelector("#soundToggle");
  const restOverlay = el.querySelector("#restOverlay");
  const restCountdown = el.querySelector("#restCountdown");
  const restNext = el.querySelector("#restNext");

  let landmarker = null;
  let drawingUtils = null;
  let cameraActive = false;
  let canvasReady = false;
  let lastVideoTime = -1;
  let rafId = null;
  let restIntervalId = null;
  let ended = false;

  let blockIndex = 0;
  let setIndex = 0;
  let phase = "loading"; // "loading" | "working" | "resting" | "finished"
  let engine = null;
  const resultsByExercise = new Map();

  function currentBlock() {
    return plan[blockIndex];
  }

  function accumulateCurrentSet() {
    if (!engine) return;
    const block = currentBlock();
    const amount = block.mode === "hold" ? engine.elapsedSeconds : engine.count;
    const entry = resultsByExercise.get(block.exerciseId) || { exerciseLabel: block.label, muscles: block.muscles, reps: 0 };
    entry.reps += amount;
    resultsByExercise.set(block.exerciseId, entry);
  }

  function setMessage(text, type) {
    messageBanner.textContent = text;
    messageBanner.className = `messageBanner ${type}`;
  }

  // Flash plein ecran declenche a chaque repetition validee. Utilise le
  // Web Animations API plutot qu'une classe CSS : ca gere nativement les
  // declenchements rapproches (une nouvelle animation demarre a chaque
  // appel sans avoir a reinitialiser un etat de classe).
  function flashScreen() {
    repFlash.animate(
      [{ backgroundColor: "rgba(0, 230, 118, 0.7)" }, { backgroundColor: "rgba(0, 230, 118, 0)" }],
      { duration: FLASH_DURATION_MS, easing: "ease-out" }
    );
  }

  function updateSoundToggle() {
    soundToggle.textContent = voiceCoach.enabled ? "Son : active" : "Son : coupe";
  }
  updateSoundToggle();

  debugToggle.addEventListener("click", () => debugBox.classList.toggle("visible"));
  soundToggle.addEventListener("click", () => {
    voiceCoach.setEnabled(!voiceCoach.enabled);
    updateSoundToggle();
  });

  function updateHud() {
    const block = currentBlock();
    exerciseLabelEl.textContent = `${block.label} - serie ${setIndex + 1}/${block.sets}`;

    if (block.mode === "hold") {
      counterEl.textContent = engine ? engine.elapsedSeconds : 0;
      counterLabelEl.textContent = `Secondes / ${block.targetHoldSeconds}`;
    } else {
      counterEl.textContent = engine ? engine.count : 0;
      counterLabelEl.textContent = `Repetitions / ${block.targetReps}`;
    }
    stagePill.textContent = `Muscles : ${block.muscles.map(muscleLabel).join(", ")}`;
  }

  function targetReached(block) {
    if (!engine) return false;
    if (block.mode === "hold") return engine.elapsedSeconds >= block.targetHoldSeconds;
    return engine.count >= block.targetReps;
  }

  function startSet() {
    const block = currentBlock();
    engine = createExerciseEngine(getExercise(block.exerciseId));
    phase = "working";
    restOverlay.hidden = true;
    try {
      voiceCoach.announceExerciseIntro(block.label, setIndex + 1, block.sets);
    } finally {
      updateHud();
    }
  }

  function startRest(seconds, onDone) {
    phase = "resting";
    let remaining = seconds;
    restOverlay.hidden = false;
    restCountdown.textContent = remaining;
    restNext.textContent = "";
    voiceCoach.announceRestStart(seconds);

    restIntervalId = setInterval(() => {
      remaining -= 1;
      restCountdown.textContent = Math.max(remaining, 0);
      if (remaining <= 0) {
        clearInterval(restIntervalId);
        restIntervalId = null;
        // onDone() doit s'executer meme si l'annonce vocale echoue : la
        // reprise de la seance ne doit jamais dependre de la voix.
        try {
          voiceCoach.announceRestEnd();
        } finally {
          onDone();
        }
      }
    }, 1000);
  }

  function finishSet() {
    accumulateCurrentSet();

    const block = currentBlock();
    const isLastSetOfBlock = setIndex >= block.sets - 1;
    const isLastBlock = blockIndex >= plan.length - 1;

    if (isLastSetOfBlock && isLastBlock) {
      finishWorkout();
      return;
    }

    startRest(REST_SECONDS, () => {
      try {
        if (isLastSetOfBlock) {
          blockIndex += 1;
          setIndex = 0;
          voiceCoach.announceNextExercise(currentBlock().label);
        } else {
          setIndex += 1;
        }
      } finally {
        startSet();
      }
    });
  }

  function stopCamera() {
    if (!cameraActive && rafId === null) return;
    cameraActive = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    stopCameraStream(video);
  }

  async function finishWorkout() {
    if (ended) return;
    ended = true;
    phase = "finished";
    if (restIntervalId) {
      clearInterval(restIntervalId);
      restIntervalId = null;
    }
    restOverlay.hidden = true;
    stopCamera();

    const exerciseCount = resultsByExercise.size;
    voiceCoach.announceWorkoutComplete(exerciseCount);
    setMessage("Seance terminee", "success");

    try {
      await withTimeout(submitWorkoutResults(username, Array.from(resultsByExercise.values())), SUBMIT_TIMEOUT_MS);
    } catch (err) {
      console.error("Enregistrement de la seance impossible", err);
    }

    setTimeout(() => ctx.navigate("home"), 1600);
  }

  function abortWorkout() {
    if (ended) return;
    if (phase === "working") accumulateCurrentSet();
    finishWorkout();
  }

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
    if (lms) {
      drawingUtils.drawConnectors(lms, PoseLandmarker.POSE_CONNECTIONS, { color: "#00e676", lineWidth: 3 });
      drawingUtils.drawLandmarks(lms, { color: "#ffffff", radius: 3 });
    }

    if (phase !== "working") {
      ctx2d.restore();
      return;
    }

    if (!lms) {
      setMessage("Mets-toi dans le cadre", "neutral");
      ctx2d.restore();
      return;
    }

    const evalResult = engine.evaluate(lms);
    if (!evalResult.visible) {
      setMessage(evalResult.message, "neutral");
      ctx2d.restore();
      return;
    }

    setMessage(evalResult.message, evalResult.type);
    updateHud();

    if (evalResult.repCompleted) {
      flashScreen();
      voiceCoach.announceRepCount(engine.count);
    } else if (evalResult.type === "warning") {
      voiceCoach.announcePosture(evalResult.code, evalResult.message);
    }
    voiceCoach.maybeEncourage();

    if (targetReached(currentBlock())) finishSet();

    ctx2d.restore();
  }

  function renderLoop() {
    if (!cameraActive) return;
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

      cameraActive = true;
      voiceCoach.announceSessionStart();
      startSet();
      renderLoop();
    } catch (err) {
      console.error(err);
      setMessage("Impossible de demarrer la camera ou le modele", "warning");
    }
  }

  endBtn.addEventListener("click", abortWorkout);

  start();

  return () => {
    stopCamera();
    if (restIntervalId) clearInterval(restIntervalId);
  };
}
