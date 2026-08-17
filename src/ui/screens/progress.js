import { fetchUserSessionsRange, describeHistoriqueError } from "../../db/historique.js";
import { dailyTotals, totalsByExercise, bestSession, computeStreak } from "../../workout/progressStats.js";
import { withTimeout } from "../../core/withTimeout.js";
import { renderLineChart } from "../charts/lineChart.js";
import { renderBarChart } from "../charts/barChart.js";
import { escapeHtml } from "../escapeHtml.js";
import { renderTopNav } from "../nav.js";

const RANGE_DAYS = 30;
const FETCH_TIMEOUT_MS = 6000;

export function renderProgressScreen(root, ctx) {
  const username = ctx.getUsername();

  const el = document.createElement("div");
  el.className = "screen progressScreen";
  el.appendChild(renderTopNav("progress", ctx));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="homeHeader">
      <h1>Progression</h1>
      <p class="subtitle">Tes performances sur les ${RANGE_DAYS} derniers jours</p>
    </div>
    <div class="statsRow">
      <div class="statTile"><div class="statValue" id="statTotalRange">-</div><div class="statLabel">Total periode</div></div>
      <div class="statTile"><div class="statValue" id="statBest">-</div><div class="statLabel">Record seance</div></div>
      <div class="statTile"><div class="statValue" id="statStreak">-</div><div class="statLabel">Jours de suite</div></div>
    </div>
    <div class="setupSection">
      <h2>Repetitions par jour</h2>
      <div id="dailyChart" class="chartContainer"><p class="emptyState">Chargement</p></div>
    </div>
    <div class="setupSection">
      <h2>Repartition par exercice</h2>
      <div id="exerciseChart" class="chartContainer"><p class="emptyState">Chargement</p></div>
    </div>
  `
  );

  root.appendChild(el);

  async function load() {
    const dailyChartEl = el.querySelector("#dailyChart");
    const exerciseChartEl = el.querySelector("#exerciseChart");

    try {
      const sessions = await withTimeout(fetchUserSessionsRange(username, RANGE_DAYS), FETCH_TIMEOUT_MS);

      const daily = dailyTotals(sessions, RANGE_DAYS);
      const byExercise = totalsByExercise(sessions);
      const best = bestSession(sessions);
      const streak = computeStreak(sessions);
      const totalRange = sessions.reduce((sum, s) => sum + s.reps, 0);

      el.querySelector("#statTotalRange").textContent = totalRange;
      el.querySelector("#statBest").textContent = best ? best.reps : 0;
      el.querySelector("#statStreak").textContent = streak;

      dailyChartEl.innerHTML = daily.some((d) => d.total > 0)
        ? renderLineChart(daily)
        : '<p class="emptyState">Aucune seance enregistree sur cette periode.</p>';

      exerciseChartEl.innerHTML =
        byExercise.length > 0 ? renderBarChart(byExercise) : '<p class="emptyState">Aucune seance enregistree pour l\'instant.</p>';
    } catch (err) {
      dailyChartEl.innerHTML = `<p class="errorText">${escapeHtml(describeHistoriqueError(err))}</p>`;
      exerciseChartEl.innerHTML = "";
    }
  }

  load();

  return () => {};
}
