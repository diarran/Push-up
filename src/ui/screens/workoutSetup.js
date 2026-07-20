import { analyzeBalance } from "../../biomechanics/balanceRules.js";
import { muscleLabel } from "../../biomechanics/muscleGroups.js";
import { generateWorkout, deriveLevelFromHistory, REST_SECONDS } from "../../workout/generator.js";
import { fetchUserSessions } from "../../db/historique.js";
import { withTimeout } from "../../core/withTimeout.js";
import { escapeHtml } from "../escapeHtml.js";

const DEFAULT_MINUTES = 20;
const HISTORY_FETCH_TIMEOUT_MS = 4000;

export function renderWorkoutSetupScreen(root, ctx) {
  const username = ctx.getUsername();
  let selection = new Set(ctx.getMuscleSelection());
  let currentPlan = null;

  const el = document.createElement("div");
  el.className = "screen workoutSetupScreen";
  el.innerHTML = `
    <div class="homeHeader">
      <h1>Prepare ta seance</h1>
      <p class="subtitle">Equilibre musculaire, temps disponible, puis generation.</p>
    </div>

    <div class="setupSection">
      <h2>Equilibre biomecanique</h2>
      <div id="balanceBox"></div>
    </div>

    <div class="setupSection">
      <h2>Temps disponible</h2>
      <div class="timeRow">
        <input type="range" id="minutesRange" min="5" max="45" step="5" value="${DEFAULT_MINUTES}" />
        <span id="minutesValue">${DEFAULT_MINUTES} min</span>
      </div>
      <button id="generateBtn" class="primaryBtn">Generer la seance</button>
    </div>

    <div class="setupSection" id="planSection" hidden>
      <h2>Ta seance</h2>
      <div id="planPreview"></div>
      <button id="startWorkoutBtn" class="primaryBtn">Commencer</button>
    </div>
  `;
  root.appendChild(el);

  const balanceBox = el.querySelector("#balanceBox");
  const minutesRange = el.querySelector("#minutesRange");
  const minutesValue = el.querySelector("#minutesValue");
  const generateBtn = el.querySelector("#generateBtn");
  const planSection = el.querySelector("#planSection");
  const planPreview = el.querySelector("#planPreview");
  const startWorkoutBtn = el.querySelector("#startWorkoutBtn");

  function renderBalance() {
    const { warnings, suggestions } = analyzeBalance(Array.from(selection));

    if (warnings.length === 0) {
      balanceBox.innerHTML = '<p class="emptyState">Selection equilibree, aucune alerte.</p>';
      return;
    }

    const warningsHtml = warnings.map((w) => `<p class="warningBox">${escapeHtml(w.message)}</p>`).join("");
    const suggestionsHtml = suggestions
      .map(
        (s) => `<button type="button" class="suggestionPill" data-muscle="${escapeHtml(s.id)}">Ajouter ${escapeHtml(s.label)}</button>`
      )
      .join("");

    balanceBox.innerHTML = `${warningsHtml}<div class="suggestionRow">${suggestionsHtml}</div>`;

    balanceBox.querySelectorAll("[data-muscle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selection.add(btn.dataset.muscle);
        ctx.setMuscleSelection(Array.from(selection));
        renderBalance();
      });
    });
  }
  renderBalance();

  minutesRange.addEventListener("input", () => {
    minutesValue.textContent = `${minutesRange.value} min`;
  });

  generateBtn.addEventListener("click", async () => {
    generateBtn.disabled = true;
    generateBtn.textContent = "Generation";

    let level = "intermediaire";
    try {
      const sessions = await withTimeout(fetchUserSessions(username, 5), HISTORY_FETCH_TIMEOUT_MS);
      level = deriveLevelFromHistory(sessions);
    } catch (err) {
      // pas d'historique exploitable (reseau lent/coupe, Supabase non
      // configure, ou premiere utilisation) : on reste sur le niveau par
      // defaut, sans jamais bloquer la generation.
    }

    currentPlan = generateWorkout({
      muscleIds: Array.from(selection),
      minutes: Number(minutesRange.value),
      level
    });

    planPreview.innerHTML = currentPlan.blocks
      .map((block) => {
        const target = block.mode === "hold" ? `${block.targetHoldSeconds} s` : `${block.targetReps} repetitions`;
        return `
        <div class="planBlock">
          <div class="planBlockLabel">${escapeHtml(block.label)}</div>
          <div class="planBlockMeta">${block.sets} series de ${target}, repos ${REST_SECONDS} s</div>
        </div>`;
      })
      .join("");

    planSection.hidden = false;
    generateBtn.disabled = false;
    generateBtn.textContent = "Regenerer";
  });

  startWorkoutBtn.addEventListener("click", () => {
    if (!currentPlan || currentPlan.blocks.length === 0) return;
    // Doit rester la toute premiere instruction du gestionnaire de clic,
    // avant tout traitement asynchrone (voir coach.js: unlock()).
    ctx.voiceCoach.unlock();
    ctx.setWorkoutPlan(currentPlan.blocks);
    ctx.navigate("session");
  });

  return () => {};
}
