import { fetchLeaderboard, fetchUserSessions, describeHistoriqueError } from "../../db/historique.js";
import { formatShortDate, formatDuration } from "../../core/date.js";
import { escapeHtml } from "../escapeHtml.js";
import { renderTopNav } from "../nav.js";

export function renderHomeScreen(root, ctx) {
  const username = ctx.getUsername();

  // Precharge le modele de detection de pose en arriere-plan pour reduire
  // le temps d'attente au moment ou l'utilisateur lance sa seance.
  ctx.getPoseLandmarker().catch(() => {});

  const el = document.createElement("div");
  el.className = "screen homeScreen";
  el.appendChild(renderTopNav("home", ctx));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="homeHeader">
      <h1>BSE push up</h1>
      <p class="subtitle">${escapeHtml(username)}</p>
    </div>
    <div class="statsRow">
      <div class="statTile"><div class="statValue" id="statToday">-</div><div class="statLabel">Aujourd'hui</div></div>
      <div class="statTile"><div class="statValue" id="statTotal">-</div><div class="statLabel">Total</div></div>
      <div class="statTile"><div class="statValue" id="statSessions">-</div><div class="statLabel">Seances</div></div>
    </div>
    <button id="startBtn" class="primaryBtn">Demarrer la seance</button>
    <p class="tip">Place le telephone contre un appui stable, recule-toi pour etre visible de profil, buste et jambes dans le cadre.</p>
    <div class="historySection">
      <h2>Historique</h2>
      <div id="historyList"><p class="emptyState">Chargement</p></div>
    </div>
    <button id="logoutBtn" class="linkBtn">Changer de pseudo ou de code</button>
  `
  );

  root.appendChild(el);

  el.querySelector("#startBtn").addEventListener("click", () => {
    ctx.setMuscleSelection([]);
    ctx.navigate("targeting");
  });
  el.querySelector("#logoutBtn").addEventListener("click", () => ctx.logout());

  async function load() {
    try {
      const [leaderboard, sessions] = await Promise.all([
        fetchLeaderboard(),
        fetchUserSessions(username, 10)
      ]);

      const own = leaderboard.find((row) => row.username === username);
      el.querySelector("#statToday").textContent = own ? own.todayReps : 0;
      el.querySelector("#statTotal").textContent = own ? own.totalReps : 0;
      el.querySelector("#statSessions").textContent = own ? own.sessions : 0;

      const historyList = el.querySelector("#historyList");
      if (sessions.length === 0) {
        historyList.innerHTML = '<p class="emptyState">Aucune seance enregistree pour l\'instant.</p>';
      } else {
        historyList.innerHTML = sessions
          .map(
            (s) => `
          <div class="historyItem">
            <div>
              <div class="hDate">${formatShortDate(s.performedOn)}</div>
              <div class="hMeta">${escapeHtml(s.exerciseLabel || "")}${
                s.durationSeconds != null ? ` - ${formatDuration(s.durationSeconds)}` : ""
              }</div>
            </div>
            <div class="hReps">${s.reps}</div>
          </div>`
          )
          .join("");
      }
    } catch (err) {
      el.querySelector("#historyList").innerHTML =
        `<p class="errorText">${escapeHtml(describeHistoriqueError(err))}</p>`;
    }
  }

  load();

  return () => {};
}
