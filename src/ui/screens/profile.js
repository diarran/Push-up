import { fetchUserSessions, describeHistoriqueError } from "../../db/historique.js";
import {
  fetchReportsForSessions,
  reportSession,
  isModerationSupported,
  TYPE_RECALCUL,
  TYPE_ANNULATION
} from "../../db/signalements.js";
import {
  fetchValidationsForSessions,
  validateSession,
  isValidationSupported,
  isSessionClosed,
  VALIDATIONS_REQUISES,
  DELAI_CLOTURE_JOURS
} from "../../db/validations.js";
import { sessionVideoUrl } from "../../db/videos.js";
import { formatShortDate, formatDuration } from "../../core/date.js";
import { escapeHtml } from "../escapeHtml.js";
import { renderTopNav } from "../nav.js";

const SESSION_LIMIT = 40;

// Profil detaille d'un membre, ouvert depuis le classement.
//
// Le but n'est pas seulement d'admirer les scores : c'est de pouvoir
// verifier une performance. Chaque seance affiche donc sa duree et, quand
// elle existe, la video enregistree pendant la seance (camera + squelette
// detecte). Si la video ne colle pas au score, n'importe quel membre peut
// signaler la seance ; c'est l'administrateur qui tranche.
export function renderProfileScreen(root, ctx) {
  const viewer = ctx.getUsername();
  const target = ctx.getProfileTarget() || viewer;
  const isSelf = target === viewer;

  const el = document.createElement("div");
  el.className = "screen profileScreen";
  el.appendChild(renderTopNav("leaderboard", ctx));

  el.insertAdjacentHTML(
    "beforeend",
    `
    <div class="profileHeader">
      <button id="backBtn" class="linkBtn backLink">Retour au classement</button>
      <h1>${escapeHtml(target)}</h1>
      <p class="subtitle">${isSelf ? "Ton profil" : "Profil du membre"}</p>
    </div>
    <div class="statsRow">
      <div class="statTile"><div class="statValue" id="pTotal">-</div><div class="statLabel">Repetitions</div></div>
      <div class="statTile"><div class="statValue" id="pSessions">-</div><div class="statLabel">Seances</div></div>
      <div class="statTile"><div class="statValue" id="pBest">-</div><div class="statLabel">Record</div></div>
    </div>
    <div class="statsRow">
      <div class="statTile"><div class="statValue" id="pTime">-</div><div class="statLabel">Temps total</div></div>
      <div class="statTile"><div class="statValue" id="pAvg">-</div><div class="statLabel">Moyenne / seance</div></div>
      <div class="statTile"><div class="statValue" id="pVideos">-</div><div class="statLabel">Avec video</div></div>
    </div>
    <div class="historySection">
      <h2>Seances</h2>
      <p class="fieldHint">${
        isSelf
          ? "Chaque seance filmee peut etre revue ici. C'est ce que les autres verront s'ils contestent un score."
          : "Ouvre la video pour verifier une performance. Un doute ? Signale la seance, l'administrateur tranchera."
      }</p>
      <div id="sessionList"><p class="emptyState">Chargement</p></div>
    </div>
  `
  );

  root.appendChild(el);

  const listEl = el.querySelector("#sessionList");
  el.querySelector("#backBtn").addEventListener("click", () => ctx.navigate("leaderboard"));

  let sessions = [];
  let reportsBySession = new Map();
  let validationsBySession = new Map();

  function validatorsOf(session) {
    return validationsBySession.get(session.id) || [];
  }

  function hasPendingReport(session) {
    return (reportsBySession.get(session.id) || []).some((r) => r.status === "en_attente");
  }

  function closedState(session) {
    return isSessionClosed({
      createdAt: session.createdAt,
      validationCount: validatorsOf(session).length,
      hasPendingReport: hasPendingReport(session)
    });
  }

  function statusBadge(session) {
    const reports = reportsBySession.get(session.id) || [];
    // L'annulation prime : la seance ne compte plus nulle part, c'est
    // l'information la plus importante a afficher.
    if (session.cancelled) {
      return '<span class="badge badgeDanger">Annulee par l\'administrateur</span>';
    }
    const pending = reports.filter((r) => r.status === "en_attente");
    if (pending.length > 0) {
      return `<span class="badge badgeWarn">Signalee (${pending.length})</span>`;
    }
    if (session.originalReps !== null && session.originalReps !== undefined) {
      return `<span class="badge badgeInfo">Recalculee (${session.originalReps} au depart)</span>`;
    }
    const refused = reports.some((r) => r.status === "refuse");
    if (refused) return '<span class="badge badgeOk">Signalement rejete</span>';
    if (closedState(session)) return '<span class="badge badgeOk">Validee - definitive</span>';
    return "";
  }

  // Ligne de validation : qui a valide, combien il en manque, et le bouton
  // pour ajouter sa voix. Absente sur ses propres seances (on ne valide pas
  // sa performance) et quand la migration 0005 manque.
  function validationRow(session) {
    if (!isValidationSupported() || session.cancelled) return "";

    const validateurs = validatorsOf(session);
    const dejaValide = validateurs.includes(viewer);
    const close = closedState(session);

    const compte = `${Math.min(validateurs.length, VALIDATIONS_REQUISES)} / ${VALIDATIONS_REQUISES} validation${
      VALIDATIONS_REQUISES > 1 ? "s" : ""
    }`;
    const noms = validateurs.length > 0 ? ` (${escapeHtml(validateurs.join(", "))})` : "";

    return `
      <div class="validationRow">
        <span class="validationCount">${compte}${noms}</span>
        ${
          isSelf || dejaValide || close
            ? ""
            : `<button class="ghostPill" data-action="validate">Je valide</button>`
        }
        ${dejaValide ? '<span class="validationDone">Tu as valide</span>' : ""}
      </div>`;
  }

  function renderSession(session) {
    const url = sessionVideoUrl(session.videoPath);
    const duration = session.durationSeconds != null ? formatDuration(session.durationSeconds) : "duree inconnue";
    const cadence =
      session.durationSeconds > 0 && session.reps > 0
        ? `${(session.reps / (session.durationSeconds / 60)).toFixed(1)} / min`
        : "-";

    return `
      <div class="sessionCard${session.cancelled ? " isCancelled" : ""}" data-session="${escapeHtml(session.id)}">
        <div class="sessionTop">
          <div>
            <div class="hDate">${escapeHtml(formatShortDate(session.performedOn))}</div>
            <div class="hMeta">${escapeHtml(session.exerciseLabel || "")} - ${escapeHtml(duration)} - ${escapeHtml(cadence)}</div>
          </div>
          <div class="hReps">${session.reps}</div>
        </div>
        ${statusBadge(session)}
        ${validationRow(session)}
        <div class="sessionActions">
          ${
            url
              ? `<button class="ghostPill" data-action="video">Voir la video</button>`
              : `<span class="noVideoTag">${
                  // Une video effacee par la purge et une seance jamais
                  // filmee ne veulent pas dire la meme chose : la premiere
                  // a bien existe et a fait son office.
                  session.videoPurged
                    ? `Video effacee (seance close apres ${DELAI_CLOTURE_JOURS} jours)`
                    : "Aucune video"
                }</span>`
          }
          ${
            // Pas de bouton sur ses propres seances, sur une seance close
            // (elle n'est plus contestable), ni quand la migration 0003
            // manque : proposer une action qui echouera a coup sur ne sert
            // qu'a afficher une erreur.
            isSelf || session.cancelled || closedState(session) || !isModerationSupported()
              ? ""
              : `<button class="ghostPill" data-action="report">Signaler</button>`
          }
        </div>
        <div class="videoSlot" hidden></div>
        <div class="reportSlot" hidden></div>
      </div>`;
  }

  function toggleVideo(card, session) {
    const slot = card.querySelector(".videoSlot");
    if (!slot.hidden) {
      // Referme et coupe la lecture : sur telephone, plusieurs videos
      // ouvertes en meme temps saturent vite la memoire.
      slot.hidden = true;
      slot.innerHTML = "";
      card.querySelector('[data-action="video"]').textContent = "Voir la video";
      return;
    }

    const url = sessionVideoUrl(session.videoPath);
    slot.innerHTML = `
      <video class="sessionVideo" controls playsinline preload="metadata" src="${escapeHtml(url)}"></video>
      <p class="fieldHint">Le squelette vert est ce que le compteur a reellement suivi.</p>`;
    slot.hidden = false;
    card.querySelector('[data-action="video"]').textContent = "Masquer la video";
  }

  function toggleReport(card, session) {
    const slot = card.querySelector(".reportSlot");
    if (!slot.hidden) {
      slot.hidden = true;
      slot.innerHTML = "";
      return;
    }

    slot.innerHTML = `
      <form class="reportForm">
        <p class="reportTitle">Signaler cette seance</p>
        <label class="fieldLabel">
          Demande
          <select class="reportType">
            <option value="${TYPE_RECALCUL}">Recalculer les repetitions</option>
            <option value="${TYPE_ANNULATION}">Annuler la seance</option>
          </select>
        </label>
        <label class="fieldLabel reportRepsField">
          Nombre de repetitions que tu comptes
          <input type="number" class="reportReps" min="0" max="${Math.max(0, session.reps)}" value="${Math.max(0, session.reps - 1)}" />
        </label>
        <label class="fieldLabel">
          Motif
          <textarea class="reportMotif" maxlength="500" rows="2" placeholder="Pompes pas assez basses, coudes pas plies..."></textarea>
        </label>
        <button type="submit" class="primaryBtn smallBtn">Envoyer le signalement</button>
        <p class="reportStatus"></p>
      </form>`;
    slot.hidden = false;

    const form = slot.querySelector(".reportForm");
    const typeEl = slot.querySelector(".reportType");
    const repsField = slot.querySelector(".reportRepsField");
    const statusEl = slot.querySelector(".reportStatus");

    typeEl.addEventListener("change", () => {
      repsField.hidden = typeEl.value !== TYPE_RECALCUL;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      statusEl.textContent = "Envoi...";
      statusEl.className = "reportStatus";

      try {
        await reportSession({
          sessionId: session.id,
          author: viewer,
          type: typeEl.value,
          motif: slot.querySelector(".reportMotif").value,
          proposedReps: typeEl.value === TYPE_RECALCUL ? Number(slot.querySelector(".reportReps").value) : null
        });

        // Surtout pas de rechargement ici : il reconstruirait toute la
        // liste et emporterait la confirmation avant qu'elle soit lue.
        // On met a jour l'etiquette de la carte a la main, et la liste se
        // rafraichira a la prochaine ouverture de l'ecran.
        form.innerHTML = '<p class="reportStatus okText">Signalement envoye. L\'administrateur tranchera.</p>';
        const reports = reportsBySession.get(session.id) || [];
        reports.push({ status: "en_attente" });
        reportsBySession.set(session.id, reports);
        const badge = card.querySelector(".badge");
        const nouveau = statusBadge(session);
        if (badge) badge.outerHTML = nouveau;
        else card.querySelector(".sessionTop").insertAdjacentHTML("afterend", nouveau);
      } catch (err) {
        statusEl.textContent = describeHistoriqueError(err);
        statusEl.className = "reportStatus errorText";
        submitBtn.disabled = false;
      }
    });
  }

  // Comme pour le signalement : on met a jour la carte sur place plutot que
  // de reconstruire la liste, pour que le retour reste lisible.
  async function onValidate(card, session, button) {
    button.disabled = true;
    button.textContent = "Envoi...";
    try {
      await validateSession(session.id, viewer);

      const validateurs = validatorsOf(session);
      if (!validateurs.includes(viewer)) validateurs.push(viewer);
      validationsBySession.set(session.id, validateurs);

      const row = card.querySelector(".validationRow");
      if (row) row.outerHTML = validationRow(session);
      const badge = card.querySelector(".badge");
      const nouveau = statusBadge(session);
      if (badge) badge.outerHTML = nouveau;
      else if (nouveau) card.querySelector(".sessionTop").insertAdjacentHTML("afterend", nouveau);
    } catch (err) {
      button.disabled = false;
      button.textContent = "Je valide";
      card.insertAdjacentHTML(
        "beforeend",
        `<p class="reportStatus errorText">${escapeHtml(describeHistoriqueError(err))}</p>`
      );
    }
  }

  function renderList() {
    if (sessions.length === 0) {
      listEl.innerHTML = '<p class="emptyState">Aucune seance enregistree.</p>';
      return;
    }

    listEl.innerHTML = sessions.map(renderSession).join("");

    listEl.querySelectorAll(".sessionCard").forEach((card) => {
      const session = sessions.find((s) => s.id === card.dataset.session);
      if (!session) return;
      const videoBtn = card.querySelector('[data-action="video"]');
      const reportBtn = card.querySelector('[data-action="report"]');
      const validateBtn = card.querySelector('[data-action="validate"]');
      if (videoBtn) videoBtn.addEventListener("click", () => toggleVideo(card, session));
      if (reportBtn) reportBtn.addEventListener("click", () => toggleReport(card, session));
      if (validateBtn) validateBtn.addEventListener("click", () => onValidate(card, session, validateBtn));
    });
  }

  function renderStats() {
    // Les seances annulees sont affichees dans la liste mais ne comptent
    // dans aucun total : sinon ce profil contredirait le classement, qui
    // les exclut.
    const comptees = sessions.filter((s) => !s.cancelled);
    const total = comptees.reduce((sum, s) => sum + s.reps, 0);
    const timed = comptees.filter((s) => s.durationSeconds != null);
    const totalTime = timed.reduce((sum, s) => sum + s.durationSeconds, 0);
    const best = comptees.reduce((max, s) => Math.max(max, s.reps), 0);
    const withVideo = comptees.filter((s) => s.videoPath).length;

    el.querySelector("#pTotal").textContent = total;
    el.querySelector("#pSessions").textContent = comptees.length;
    el.querySelector("#pBest").textContent = best;
    el.querySelector("#pTime").textContent = timed.length > 0 ? formatDuration(totalTime) : "-";
    el.querySelector("#pAvg").textContent = comptees.length > 0 ? Math.round(total / comptees.length) : 0;
    el.querySelector("#pVideos").textContent = `${withVideo}/${comptees.length}`;
  }

  async function load() {
    try {
      // Les seances annulees restent visibles ici, barrees : leur auteur
      // doit pouvoir constater la decision, pas voir une seance disparaitre
      // sans explication.
      sessions = await fetchUserSessions(target, SESSION_LIMIT, { includeCancelled: true });
      // Signalements et validations sont un bonus d'affichage : leur
      // absence (migration 0003 ou 0005 pas executee) ne doit pas vider la
      // liste des seances.
      const ids = sessions.map((s) => s.id);
      const [reports, validations] = await Promise.all([
        fetchReportsForSessions(ids).catch((err) => {
          console.warn("Signalements non charges", err);
          return new Map();
        }),
        fetchValidationsForSessions(ids).catch((err) => {
          console.warn("Validations non chargees", err);
          return new Map();
        })
      ]);
      reportsBySession = reports;
      validationsBySession = validations;
      renderStats();
      renderList();
    } catch (err) {
      listEl.innerHTML = `<p class="errorText">${escapeHtml(describeHistoriqueError(err))}</p>`;
    }
  }

  load();

  return () => {};
}
