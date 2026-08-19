import {
  fetchLeaderboard,
  fetchUserSessions,
  describeHistoriqueError,
  HistoriqueError
} from "../../db/historique.js";
import { deleteAccount, changePin, isValidPin, PinNotSupportedError } from "../../db/comptes.js";
import { deleteSessionVideos } from "../../db/videos.js";
import { formatShortDate, formatDuration } from "../../core/date.js";
import { createPushupSessionPlan } from "../../workout/pushupSession.js";
import { trashTalkForStanding } from "../../social/trashTalk.js";
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
    <p id="trashTalk" class="trashTalk" hidden></p>
    <div class="statsRow">
      <div class="statTile"><div class="statValue" id="statToday">-</div><div class="statLabel">Aujourd'hui</div></div>
      <div class="statTile"><div class="statValue" id="statTotal">-</div><div class="statLabel">Total</div></div>
      <div class="statTile"><div class="statValue" id="statSessions">-</div><div class="statLabel">Seances</div></div>
    </div>
    <button id="startBtn" class="primaryBtn">Demarrer les pompes</button>
    <p class="tip">Place le telephone contre un appui stable et mets-toi de profil : epaule, coude et poignet doivent rester dans le cadre. Compte autant de pompes que tu veux, la seance s'arrete avec le bouton Terminer.</p>
    <div class="historySection">
      <h2>Historique</h2>
      <div id="historyList"><p class="emptyState">Chargement</p></div>
    </div>
    <button id="profileBtn" class="linkBtn">Mon profil et mes videos</button>
    <button id="bodyBtn" class="linkBtn">Voir le corps 3D</button>
    <button id="pinBtn" class="linkBtn">Changer mon code</button>
    <button id="logoutBtn" class="linkBtn">Changer de pseudo</button>
    <button id="deleteBtn" class="linkBtn dangerLink">Supprimer mon compte</button>
    <div id="accountPanel" class="accountPanel" hidden></div>
  `
  );

  root.appendChild(el);

  const panel = el.querySelector("#accountPanel");

  // Parcours reduit aux pompes : on saute le ciblage 3D et le generateur de
  // seance (toujours en place, voir README) pour aller droit a la
  // demonstration puis a la camera.
  el.querySelector("#startBtn").addEventListener("click", () => {
    ctx.setWorkoutPlan(createPushupSessionPlan());
    ctx.navigate("tutorial");
  });
  el.querySelector("#bodyBtn").addEventListener("click", () => ctx.navigate("bodyViewer"));
  el.querySelector("#logoutBtn").addEventListener("click", () => ctx.logout());
  el.querySelector("#profileBtn").addEventListener("click", () => {
    ctx.setProfileTarget(username);
    ctx.navigate("profile");
  });

  // ------------------------------------------------------------------
  // Panneau de compte : changement de code et suppression. Les deux
  // demandent le code actuel, verifie par la base.
  // ------------------------------------------------------------------

  function closePanel() {
    panel.hidden = true;
    panel.innerHTML = "";
  }

  function openPanel(html, onSubmit) {
    panel.innerHTML = html;
    panel.hidden = false;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const form = panel.querySelector("form");
    const statusEl = panel.querySelector(".panelStatus");
    panel.querySelector(".panelCancel").addEventListener("click", closePanel);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      statusEl.className = "panelStatus";
      statusEl.textContent = "Envoi...";

      try {
        await onSubmit(form, statusEl);
      } catch (err) {
        statusEl.className = "panelStatus errorText";
        statusEl.textContent =
          err instanceof PinNotSupportedError
            ? "Codes non installes : executer la migration 0003."
            : describeHistoriqueError(err);
        submitBtn.disabled = false;
      }
    });
  }

  el.querySelector("#pinBtn").addEventListener("click", () => {
    openPanel(
      `
      <form class="panelForm">
        <p class="panelTitle">Changer mon code</p>
        <label class="fieldLabel">Code actuel
          <input type="password" name="ancien" inputmode="numeric" maxlength="6" autocomplete="off" required />
        </label>
        <label class="fieldLabel">Nouveau code (4 a 6 chiffres)
          <input type="password" name="nouveau" inputmode="numeric" maxlength="6" autocomplete="off" required />
        </label>
        <button type="submit" class="primaryBtn smallBtn">Valider</button>
        <button type="button" class="linkBtn panelCancel">Annuler</button>
        <p class="panelStatus"></p>
      </form>`,
      async (form, statusEl) => {
        const nouveau = form.elements.nouveau.value.trim();
        if (!isValidPin(nouveau)) throw new HistoriqueError("Le nouveau code doit contenir de 4 a 6 chiffres");
        await changePin(username, form.elements.ancien.value.trim(), nouveau);
        statusEl.className = "panelStatus okText";
        statusEl.textContent = "Code modifie.";
      }
    );
  });

  el.querySelector("#deleteBtn").addEventListener("click", () => {
    openPanel(
      `
      <form class="panelForm">
        <p class="panelTitle">Supprimer mon compte</p>
        <p class="fieldHint">Definitif : le pseudo, toutes les seances et toutes les videos sont effaces. Utile si le pseudo comporte une faute de frappe ou si le compte a ete cree par erreur.</p>
        <label class="fieldLabel">Code du compte
          <input type="password" name="code" inputmode="numeric" maxlength="6" autocomplete="off" />
        </label>
        <label class="fieldLabel">Retape ton pseudo pour confirmer
          <input type="text" name="confirmation" autocomplete="off" required />
        </label>
        <button type="submit" class="dangerPill wideBtn">Supprimer definitivement</button>
        <button type="button" class="linkBtn panelCancel">Annuler</button>
        <p class="panelStatus"></p>
      </form>`,
      async (form, statusEl) => {
        if (form.elements.confirmation.value.trim() !== username) {
          throw new HistoriqueError("Le pseudo saisi ne correspond pas");
        }
        const videos = await deleteAccount(username, form.elements.code.value.trim());
        await deleteSessionVideos(videos);
        statusEl.className = "panelStatus okText";
        statusEl.textContent = "Compte supprime.";
        ctx.logout();
      }
    );
  });

  // ------------------------------------------------------------------

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

      const trashTalkEl = el.querySelector("#trashTalk");
      const ligne = trashTalkForStanding({ username, rows: leaderboard, period: "today" });
      if (ligne) {
        trashTalkEl.textContent = ligne;
        trashTalkEl.hidden = false;
      }

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
              }${s.videoPath ? " - video" : ""}</div>
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
