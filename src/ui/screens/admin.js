import { fetchReports, decideReport, deleteSessionAsAdmin, TYPE_RECALCUL } from "../../db/signalements.js";
import { fetchSessionsByIds, describeHistoriqueError } from "../../db/historique.js";
import { fetchUsers, deleteAccount, isValidPin } from "../../db/comptes.js";
import { sessionVideoUrl, deleteSessionVideos } from "../../db/videos.js";
import { formatShortDate, formatDuration } from "../../core/date.js";
import { escapeHtml } from "../escapeHtml.js";
import { renderTopNav } from "../nav.js";

const TYPE_LABELS = {
  recalcul: "Recalcul demande",
  annulation: "Annulation demandee"
};

const STATUS_LABELS = {
  en_attente: "En attente",
  accepte: "Accepte",
  refuse: "Refuse"
};

// Ecran d'administration : file des signalements et menage des comptes.
//
// Le code administrateur n'est jamais stocke sur l'appareil. Il est demande
// ici, garde en memoire le temps de la visite, et renvoye a la base a
// chaque decision : c'est la base qui l'accepte ou le refuse (fonction
// trancher_signalement). Un membre qui forcerait l'affichage de cet ecran
// n'obtiendrait donc que des refus.
export function renderAdminScreen(root, ctx) {
  const el = document.createElement("div");
  el.className = "screen adminScreen";
  el.appendChild(renderTopNav("admin", ctx));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="homeHeader">
      <h1>Administration</h1>
      <p class="subtitle">Signalements et comptes</p>
    </div>

    <form id="adminUnlock" class="gateForm" hidden>
      <label class="fieldLabel">
        Code administrateur
        <input type="password" id="adminCodeInput" inputmode="numeric" autocomplete="off" maxlength="6" />
      </label>
      <p class="fieldHint">Le code n'est pas conserve : il est redemande a chaque visite de cet ecran.</p>
      <button type="submit" class="primaryBtn">Deverrouiller</button>
      <p id="adminUnlockError" class="errorText" hidden></p>
    </form>

    <div id="adminContent" hidden>
      <div class="lbTabs">
        <button class="lbTab active" data-tab="en_attente">En attente</button>
        <button class="lbTab" data-tab="traites">Traites</button>
        <button class="lbTab" data-tab="comptes">Comptes</button>
      </div>
      <div id="adminList"><p class="emptyState">Chargement</p></div>
    </div>
  `
  );

  root.appendChild(el);

  const unlockForm = el.querySelector("#adminUnlock");
  const unlockError = el.querySelector("#adminUnlockError");
  const contentEl = el.querySelector("#adminContent");
  const listEl = el.querySelector("#adminList");

  let adminCode = ctx.getAdminCode();
  let tab = "en_attente";
  let reports = [];
  let sessionsById = new Map();
  let users = [];

  // ------------------------------------------------------------------
  // Deverrouillage
  // ------------------------------------------------------------------

  function showUnlock() {
    unlockForm.hidden = false;
    contentEl.hidden = true;
  }

  function showContent() {
    unlockForm.hidden = true;
    contentEl.hidden = false;
    load();
  }

  unlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    unlockError.hidden = true;
    const code = el.querySelector("#adminCodeInput").value.trim();
    if (!isValidPin(code)) {
      unlockError.textContent = "Le code doit contenir de 4 a 6 chiffres";
      unlockError.hidden = false;
      return;
    }
    adminCode = code;
    ctx.setAdminCode(code);
    showContent();
  });

  // ------------------------------------------------------------------
  // Rendu
  // ------------------------------------------------------------------

  function renderReport(report) {
    const session = sessionsById.get(report.sessionId);
    const url = session ? sessionVideoUrl(session.videoPath) : null;
    const pending = report.status === "en_attente";

    const details = session
      ? `${escapeHtml(session.username)} - ${escapeHtml(formatShortDate(session.performedOn))} - ${session.reps} repetitions${
          session.durationSeconds != null ? ` en ${escapeHtml(formatDuration(session.durationSeconds))}` : ""
        }${session.cancelled ? " (deja annulee)" : ""}`
      : "Seance introuvable (deja supprimee)";

    return `
      <div class="reportCard" data-report="${escapeHtml(report.id)}">
        <div class="reportHead">
          <span class="badge ${pending ? "badgeWarn" : "badgeOk"}">${escapeHtml(STATUS_LABELS[report.status] || report.status)}</span>
          <span class="reportType">${escapeHtml(TYPE_LABELS[report.type] || report.type)}</span>
        </div>
        <p class="reportSession">${details}</p>
        <p class="reportMeta">Signale par ${escapeHtml(report.author)}${
          report.type === TYPE_RECALCUL && report.proposedReps != null
            ? ` - propose ${report.proposedReps} repetitions`
            : ""
        }</p>
        ${report.motif ? `<p class="reportMotif">« ${escapeHtml(report.motif)} »</p>` : ""}
        ${
          report.status !== "en_attente" && report.decidedBy
            ? `<p class="reportMeta">Tranche par ${escapeHtml(report.decidedBy)}</p>`
            : ""
        }
        ${url ? `<button class="ghostPill" data-action="video">Voir la video</button>` : '<span class="noVideoTag">Aucune video</span>'}
        <div class="videoSlot" hidden></div>
        ${
          pending && session
            ? `<div class="adminActions">
                 ${
                   report.type === TYPE_RECALCUL
                     ? `<label class="fieldLabel inlineField">
                          Repetitions retenues
                          <input type="number" class="finalReps" min="0" value="${
                            report.proposedReps != null ? report.proposedReps : session.reps
                          }" />
                        </label>`
                     : ""
                 }
                 <div class="adminButtons">
                   <button class="primaryBtn smallBtn" data-action="accept">Accepter</button>
                   <button class="ghostPill" data-action="refuse">Refuser</button>
                   <button class="dangerPill" data-action="delete">Supprimer la seance</button>
                 </div>
               </div>`
            : ""
        }
        <p class="reportStatus"></p>
      </div>`;
  }

  function renderUsers() {
    if (users.length === 0) {
      listEl.innerHTML = '<p class="emptyState">Aucun compte.</p>';
      return;
    }
    listEl.innerHTML = users
      .map(
        (user) => `
      <div class="userRow" data-user="${escapeHtml(user.username)}">
        <div>
          <div class="lbName">${escapeHtml(user.username)}${user.isAdmin ? " (admin)" : ""}</div>
          <div class="hMeta">Cree le ${escapeHtml(new Date(user.createdAt).toLocaleDateString("fr-FR"))}</div>
        </div>
        ${user.isAdmin ? "" : '<button class="dangerPill" data-action="deleteUser">Supprimer</button>'}
      </div>`
      )
      .join("");

    listEl.querySelectorAll('[data-action="deleteUser"]').forEach((btn) => {
      btn.addEventListener("click", () => onDeleteUser(btn.closest(".userRow").dataset.user));
    });
  }

  function renderReports() {
    const visibles = reports.filter((r) => (tab === "en_attente" ? r.status === "en_attente" : r.status !== "en_attente"));

    if (visibles.length === 0) {
      listEl.innerHTML = `<p class="emptyState">${
        tab === "en_attente" ? "Aucun signalement en attente. Tout le monde est honnete, pour l'instant." : "Aucun signalement traite."
      }</p>`;
      return;
    }

    listEl.innerHTML = visibles.map(renderReport).join("");

    listEl.querySelectorAll(".reportCard").forEach((card) => {
      const report = reports.find((r) => r.id === card.dataset.report);
      if (!report) return;
      const session = sessionsById.get(report.sessionId);

      const videoBtn = card.querySelector('[data-action="video"]');
      if (videoBtn) {
        videoBtn.addEventListener("click", () => {
          const slot = card.querySelector(".videoSlot");
          if (!slot.hidden) {
            slot.hidden = true;
            slot.innerHTML = "";
            videoBtn.textContent = "Voir la video";
            return;
          }
          slot.innerHTML = `<video class="sessionVideo" controls playsinline preload="metadata" src="${escapeHtml(
            sessionVideoUrl(session.videoPath)
          )}"></video>`;
          slot.hidden = false;
          videoBtn.textContent = "Masquer la video";
        });
      }

      const acceptBtn = card.querySelector('[data-action="accept"]');
      const refuseBtn = card.querySelector('[data-action="refuse"]');
      const deleteBtn = card.querySelector('[data-action="delete"]');

      if (acceptBtn) {
        acceptBtn.addEventListener("click", () => {
          const repsInput = card.querySelector(".finalReps");
          onDecide(card, report, "accepte", repsInput ? Number(repsInput.value) : null);
        });
      }
      if (refuseBtn) refuseBtn.addEventListener("click", () => onDecide(card, report, "refuse", null));
      if (deleteBtn) deleteBtn.addEventListener("click", () => onDeleteSession(card, report, session));
    });
  }

  function renderCurrentTab() {
    if (tab === "comptes") renderUsers();
    else renderReports();
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  function setCardStatus(card, message, className = "reportStatus") {
    const statusEl = card.querySelector(".reportStatus");
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.className = className;
    }
  }

  async function onDecide(card, report, decision, reps) {
    setCardStatus(card, "Envoi...");
    card.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await decideReport({ reportId: report.id, decision, reps, adminCode });
      await load();
    } catch (err) {
      card.querySelectorAll("button").forEach((b) => (b.disabled = false));
      setCardStatus(card, describeHistoriqueError(err), "reportStatus errorText");
      // Code refuse : il a pu etre change depuis. On redemande.
      if (/administrateur/i.test(err.message || "")) {
        adminCode = null;
        ctx.setAdminCode(null);
        showUnlock();
      }
    }
  }

  async function onDeleteSession(card, report, session) {
    if (!window.confirm("Supprimer definitivement cette seance ? La video sera effacee.")) return;
    setCardStatus(card, "Suppression...");
    try {
      await deleteSessionAsAdmin(report.sessionId, adminCode);
      if (session && session.videoPath) await deleteSessionVideos([session.videoPath]);
      await load();
    } catch (err) {
      setCardStatus(card, describeHistoriqueError(err), "reportStatus errorText");
    }
  }

  async function onDeleteUser(username) {
    if (!window.confirm(`Supprimer le compte ${username} et tout son historique ?`)) return;
    try {
      const videos = await deleteAccount(username, adminCode);
      await deleteSessionVideos(videos);
      await load();
    } catch (err) {
      listEl.insertAdjacentHTML(
        "afterbegin",
        `<p class="errorText">${escapeHtml(describeHistoriqueError(err))}</p>`
      );
    }
  }

  // ------------------------------------------------------------------

  el.querySelectorAll(".lbTab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      el.querySelectorAll(".lbTab").forEach((b) => b.classList.toggle("active", b === btn));
      renderCurrentTab();
    });
  });

  async function load() {
    listEl.innerHTML = '<p class="emptyState">Chargement</p>';
    try {
      [reports, users] = await Promise.all([fetchReports(null, 100), fetchUsers()]);
      sessionsById = await fetchSessionsByIds(reports.map((r) => r.sessionId));
      renderCurrentTab();
    } catch (err) {
      listEl.innerHTML = `<p class="errorText">${escapeHtml(describeHistoriqueError(err))}</p>`;
    }
  }

  if (adminCode) showContent();
  else showUnlock();

  return () => {};
}
