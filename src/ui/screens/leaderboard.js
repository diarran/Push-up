import { fetchLeaderboard, describeHistoriqueError } from "../../db/historique.js";
import { escapeHtml } from "../escapeHtml.js";
import { renderTopNav } from "../nav.js";

export function renderLeaderboardScreen(root, ctx) {
  const username = ctx.getUsername();

  const el = document.createElement("div");
  el.className = "screen leaderboardScreen";
  el.appendChild(renderTopNav("leaderboard", ctx));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="homeHeader">
      <h1>Classement</h1>
      <p class="subtitle">Repetitions, groupe entier</p>
    </div>
    <div class="lbTabs">
      <button class="lbTab active" data-period="total">Total</button>
      <button class="lbTab" data-period="today">Aujourd'hui</button>
    </div>
    <div id="leaderboardList"><p class="emptyState">Chargement</p></div>
  `
  );

  root.appendChild(el);

  const list = el.querySelector("#leaderboardList");
  let rows = null;
  let period = "total";

  function renderList() {
    if (!rows) return;
    if (rows.length === 0) {
      list.innerHTML = '<p class="emptyState">Aucun score enregistre pour l\'instant.</p>';
      return;
    }

    const metric = (row) => (period === "today" ? row.todayReps : row.totalReps);
    const sorted = [...rows].sort((a, b) => metric(b) - metric(a));

    list.innerHTML = sorted
      .map(
        (row, index) => `
      <div class="leaderboardRow${row.username === username ? " isSelf" : ""}">
        <div class="lbRank">${index + 1}</div>
        <div class="lbName">${escapeHtml(row.username)}</div>
        <div class="lbStats">
          <span class="lbTotal">${metric(row)}</span>
          <span class="lbMeta">${
            period === "today" ? `${row.totalReps} au total` : `${row.sessions} seances, ${row.todayReps} aujourd'hui`
          }</span>
        </div>
      </div>`
      )
      .join("");
  }

  el.querySelectorAll(".lbTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      period = btn.dataset.period;
      el.querySelectorAll(".lbTab").forEach((b) => b.classList.toggle("active", b === btn));
      renderList();
    });
  });

  async function load() {
    try {
      rows = await fetchLeaderboard();
      renderList();
    } catch (err) {
      list.innerHTML = `<p class="errorText">${escapeHtml(describeHistoriqueError(err))}</p>`;
    }
  }

  load();

  return () => {};
}
