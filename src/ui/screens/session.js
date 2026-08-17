import { PoseLandmarker, DrawingUtils } from "../../core/poseEngine.js";
import { startCameraStream, stopCameraStream } from "../../core/cameraStream.js";
import { createExerciseEngine } from "../../core/exercises/exerciseEngine.js";
import { getExercise } from "../../core/exercises/index.js";
import { submitWorkoutResults, HistoriqueUnavailableError } from "../../db/historique.js";
import { withTimeout } from "../../core/withTimeout.js";
import { muscleLabel } from "../../biomechanics/muscleGroups.js";
import { formatDuration } from "../../core/date.js";

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
    <canvas id="output" class="mirrored"></canvas>
    <div id="repFlash" class="repFlash"></div>
    <div class="hud">
      <div class="topBar">
        <div class="counterBox">
          <div class="exerciseLabel" id="exerciseLabel"></div>
          <div class="counter" id="counter">0</div>
          <div class="counterLabel" id="counterLabel">Repetitions</div>
          <div class="timerText" id="timer">00:00</div>
        </div>
        <div class="topRight">
          <button id="endBtn" class="dangerPill">Terminer</button>
          <button id="cameraFlipBtn" class="ghostPill">Retourner camera</button>
          <button id="debugToggle" class="ghostPill">Debug</button>
          <div id="debugBox" class="debugBox"></div>
        </div>
      </div>
      <div class="bottomArea">
        <div id="messageBanner" class="messageBanner neutral">Chargement du modele</div>
        <div id="stagePill" class="stagePill"></div>
      </div>
    </div>
    <div id="recapOverlay" class="recapOverlay">
      <h2>Seance terminee</h2>
      <div class="recapStats">
        <div class="recapTile">
          <div class="recapValue" id="recapReps">0</div>
          <div class="recapLabel">Repetitions</div>
        </div>
        <div class="recapTile">
          <div class="recapValue" id="recapDuration">-</div>
          <div class="recapLabel">Duree</div>
        </div>
      </div>
      <p id="recapStatus" class="recapStatus"></p>
      <button id="recapHomeBtn" class="primaryBtn">Retour a l'accueil</button>
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
  const cameraFlipBtn = el.querySelector("#cameraFlipBtn");

  let landmarker = null;
  let drawingUtils = null;
  let cameraActive = false;
  let canvasReady = false;
  let lastVideoTime = -1;
  let rafId = null;
  let ended = false;
  let facingMode = "user";

  let blockIndex = 0;
  let setIndex = 0;
  let phase = "loading"; // "loading" | "working" | "finished"
  let engine = null;
  const resultsByExercise = new Map();
  let sessionStartedAt = null;
  let setStartedAt = null;
  let timerIntervalId = null;

  const timerEl = el.querySelector("#timer");
  const recapOverlay = el.querySelector("#recapOverlay");
  const recapStatus = el.querySelector("#recapStatus");

  function sessionElapsedSeconds() {
    return sessionStartedAt === null ? 0 : (Date.now() - sessionStartedAt) / 1000;
  }

  function formatTimer(totalSeconds) {
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
    return `${m}:${s}`;
  }

  function currentBlock() {
    return plan[blockIndex];
  }

  function accumulateCurrentSet() {
    if (!engine) return;
    const block = currentBlock();
    const amount = block.mode === "hold" ? engine.elapsedSeconds : engine.count;
    const entry =
      resultsByExercise.get(block.exerciseId) ||
      { exerciseLabel: block.label, muscles: block.muscles, reps: 0, durationSeconds: 0 };
    entry.reps += amount;
    // Temps reellement passe sur cette serie (la somme des lignes en base
    // redonne la duree totale de la seance).
    if (setStartedAt !== null) {
      entry.durationSeconds += (Date.now() - setStartedAt) / 1000;
      setStartedAt = null;
    }
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

  debugToggle.addEventListener("click", () => debugBox.classList.toggle("visible"));

  // Panneau de reglage : montre l'angle mesure face aux seuils qui decident
  // du comptage, et jusqu'ou la derniere repetition est reellement
  // descendue. C'est ce qui permet de dire si une repetition non comptee
  // vient du mouvement ou d'un seuil mal regle.
  function updateDebugBox(evalResult) {
    if (!debugBox.classList.contains("visible")) return;

    const exercise = engine.exerciseDef;
    const config = exercise.thresholds || {};
    const angle = evalResult.metrics ? evalResult.metrics.primaryAngle : null;
    const lastRep = engine.lastRepMinAngle;

    debugBox.innerHTML = [
      `Cote : ${evalResult.side === "left" ? "gauche" : "droit"}`,
      `Angle : ${angle === null ? "-" : angle.toFixed(0)} deg`,
      `Lisse : ${evalResult.smoothedAngle === undefined ? "-" : evalResult.smoothedAngle.toFixed(0)} deg`,
      `Seuils : ${config.downAngle ?? "?"} / ${config.upAngle ?? "?"}`,
      `Derniere rep : ${lastRep === null || lastRep === undefined ? "-" : `${lastRep.toFixed(0)} deg`}`,
      `Bassin : ${evalResult.formVisible ? (evalResult.metrics.alignOk ? "ok" : "creuse") : "hors cadre"}`
    ].join("<br>");
  }

  // Une seance libre (seance pompes : un seul bloc, aucun objectif)
  // n'affiche ni numero de serie ni objectif chiffre : il n'y a rien a
  // suivre a part le compteur.
  function isOpenEnded(block) {
    return block.mode === "hold" ? block.targetHoldSeconds == null : block.targetReps == null;
  }

  function updateHud() {
    const block = currentBlock();
    const openEnded = isOpenEnded(block);
    exerciseLabelEl.textContent =
      openEnded && block.sets === 1 ? block.label : `${block.label} - serie ${setIndex + 1}/${block.sets}`;

    if (block.mode === "hold") {
      counterEl.textContent = engine ? engine.elapsedSeconds : 0;
      counterLabelEl.textContent = openEnded ? "Secondes" : `Secondes / ${block.targetHoldSeconds}`;
    } else {
      counterEl.textContent = engine ? engine.count : 0;
      counterLabelEl.textContent = openEnded ? "Repetitions" : `Repetitions / ${block.targetReps}`;
    }
    stagePill.textContent = `Muscles : ${block.muscles.map(muscleLabel).join(", ")}`;
  }

  function targetReached(block) {
    if (!engine) return false;
    // Sans objectif, la seance ne s'arrete que sur "Terminer".
    if (isOpenEnded(block)) return false;
    if (block.mode === "hold") return engine.elapsedSeconds >= block.targetHoldSeconds;
    return engine.count >= block.targetReps;
  }

  function startSet() {
    const block = currentBlock();
    engine = createExerciseEngine(getExercise(block.exerciseId));
    phase = "working";
    setStartedAt = Date.now();
    try {
      voiceCoach.announceExerciseIntro(block.label, setIndex + 1, block.sets);
    } finally {
      updateHud();
    }
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

    // Enchainement direct sur la serie ou l'exercice suivant, sans pause
    // chronometree.
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
  }

  function stopCamera() {
    if (!cameraActive && rafId === null) return;
    cameraActive = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    stopCameraStream(video);
  }

  // Le miroir (effet selfie) n'a de sens qu'avec la camera frontale : la
  // camera arriere doit s'afficher normalement, sans inversion.
  function applyMirror() {
    canvas.classList.toggle("mirrored", facingMode === "user");
  }

  // Le champ de vision de la camera frontale est physiquement fixe :
  // aucun reglage logiciel ne l'elargit au-dela de ce que fait deja
  // object-fit: contain (image jamais rognee). Le seul vrai levier
  // restant est de changer d'objectif : la camera arriere a souvent un
  // champ de vision different, parfois plus large.
  async function flipCamera() {
    const wasActive = cameraActive;
    cameraActive = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    stopCameraStream(video);
    canvasReady = false;
    lastVideoTime = -1;

    facingMode = facingMode === "user" ? "environment" : "user";
    applyMirror();

    try {
      await startCameraStream(video, { facingMode, width: 720, height: 1280 });
      if (wasActive) {
        cameraActive = true;
        renderLoop();
      }
    } catch (err) {
      console.error("Impossible de changer de camera", err);
      setMessage("Impossible de changer de camera", "warning");
    }
  }

  async function finishWorkout() {
    if (ended) return;
    ended = true;
    phase = "finished";
    stopCamera();
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = null;

    const exerciseCount = resultsByExercise.size;
    voiceCoach.announceWorkoutComplete(exerciseCount);

    const results = Array.from(resultsByExercise.values());
    const totalReps = results.reduce((sum, r) => sum + Math.round(r.reps), 0);
    const durationSeconds = Math.round(sessionElapsedSeconds());

    el.querySelector("#recapReps").textContent = totalReps;
    el.querySelector("#recapDuration").textContent = formatDuration(durationSeconds);
    recapOverlay.classList.add("visible");

    if (totalReps > 0) {
      recapStatus.textContent = "Enregistrement...";
      try {
        await withTimeout(submitWorkoutResults(username, results), SUBMIT_TIMEOUT_MS);
        recapStatus.textContent = "Seance enregistree";
      } catch (err) {
        console.error("Enregistrement de la seance impossible", err);
        // Une base injoignable et une requete refusee ne demandent pas la
        // meme reaction : reessayer plus tard, ou corriger la base.
        recapStatus.textContent =
          err instanceof HistoriqueUnavailableError
            ? "Base hors ligne : seance non enregistree"
            : `Enregistrement refuse : ${err.message}`;
      }
    } else {
      recapStatus.textContent = "Aucune repetition validee : rien n'a ete enregistre.";
    }
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
    updateDebugBox(evalResult);

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
      await startCameraStream(video, { facingMode, width: 720, height: 1280 });
      landmarker = await ctx.getPoseLandmarker();
      drawingUtils = new DrawingUtils(ctx2d);

      cameraActive = true;
      sessionStartedAt = Date.now();
      timerIntervalId = setInterval(() => {
        timerEl.textContent = formatTimer(sessionElapsedSeconds());
      }, 500);
      voiceCoach.announceSessionStart();
      startSet();
      renderLoop();
    } catch (err) {
      console.error(err);
      setMessage("Impossible de demarrer la camera ou le modele", "warning");
    }
  }

  endBtn.addEventListener("click", abortWorkout);
  cameraFlipBtn.addEventListener("click", flipCamera);
  el.querySelector("#recapHomeBtn").addEventListener("click", () => ctx.navigate("home"));

  start();

  return () => {
    stopCamera();
    if (timerIntervalId) clearInterval(timerIntervalId);
    timerIntervalId = null;
  };
}
