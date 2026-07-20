import { fetchLeaderboard, ScoresError } from "../../db/scores.js";
import { escapeHtml } from "../escapeHtml.js";
import { renderTopNav } from "../nav.js";

export function renderLeaderboardScreen(root, ctx) {
  const { username, passcode } = ctx.getGroupSession();

  const el = document.createElement("div");
  el.className = "screen leaderboardScreen";
  el.appendChild(renderTopNav("leaderboard", ctx));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="homeHeader">
      <h1>Classement</h1>
      <p class="subtitle">Total de repetitions, groupe entier</p>
    </div>
    <div id="leaderboardList"><p class="emptyState">Chargement</p></div>
  `
  );

  root.appendChild(el);

  async function load() {
    const list = el.querySelector("#leaderboardList");
    try {
      const rows = await fetchLeaderboard(passcode);
      if (rows.length === 0) {
        list.innerHTML = '<p class="emptyState">Aucun score enregistre pour l\'instant.</p>';
        return;
      }

      list.innerHTML = rows
        .map(
          (row, index) => `
        <div class="leaderboardRow${row.username === username ? " isSelf" : ""}">
          <div class="lbRank">${index + 1}</div>
          <div class="lbName">${escapeHtml(row.username)}</div>
          <div class="lbStats">
            <span class="lbTotal">${row.totalReps}</span>
            <span class="lbMeta">${row.sessions} seances, ${row.todayReps} aujourd'hui</span>
          </div>
        </div>`
        )
        .join("");
    } catch (err) {
      const message = err instanceof ScoresError ? err.message : "Erreur de chargement";
      list.innerHTML = `<p class="errorText">${escapeHtml(message)}</p>`;
    }
  }

  load();

  return () => {};
}
