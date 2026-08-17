import { checkGroupPasscode } from "../../auth/groupGate.js";
import { ensureUser, HistoriqueError, HistoriqueUnavailableError } from "../../db/historique.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

// Desactive temporairement le mot de passe de groupe (debogage en cours).
// Remettre a true pour retablir la protection : ca reaffiche le champ et
// reactive la verification, sans rien supprimer.
const PASSCODE_ENABLED = false;

export function renderGateScreen(root, ctx) {
  const el = document.createElement("div");
  el.className = "screen gateScreen";
  el.innerHTML = `
    <h1>BSE push up</h1>
    <p class="subtitle">Acces reserve au groupe</p>
    ${
      isSupabaseConfigured
        ? ""
        : '<p class="warningBox">Supabase n\'est pas configure. Renseigne VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir .env.example), redemarre le serveur, puis recharge la page.</p>'
    }
    <form id="gateForm" class="gateForm">
      ${
        PASSCODE_ENABLED
          ? `<label class="fieldLabel">
        Code d'acces du groupe
        <input type="password" id="passcodeInput" autocomplete="off" required />
      </label>`
          : ""
      }
      <label class="fieldLabel">
        Pseudo
        <input type="text" id="usernameInput" autocomplete="off" maxlength="24" required />
      </label>
      <p class="fieldHint">Garde toujours le meme pseudo : les seances s'additionnent par pseudo exact.</p>
      <button type="submit" id="gateSubmit" class="primaryBtn">Entrer</button>
      <p id="gateError" class="errorText" hidden></p>
    </form>
  `;
  root.appendChild(el);

  const form = el.querySelector("#gateForm");
  const errorEl = el.querySelector("#gateError");
  const submitBtn = el.querySelector("#gateSubmit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Verification";

    // Espaces normalises (debut, fin, doubles espaces) pour eviter que
    // "Toto " et "Toto" creent deux entrees distinctes au classement.
    const username = el.querySelector("#usernameInput").value.replace(/\s+/g, " ").trim();

    try {
      if (PASSCODE_ENABLED) {
        const passcode = el.querySelector("#passcodeInput").value.trim();
        if (!checkGroupPasscode(passcode)) throw new HistoriqueError("Code d'acces incorrect");
      }
      if (!username) throw new HistoriqueError("Pseudo requis");

      try {
        await ensureUser(username);
      } catch (err) {
        // Base injoignable (projet en veille, reseau coupe) : on entre quand
        // meme. Compter des pompes ne depend pas de la base ; seul
        // l'enregistrement en depend, et il est signale la ou il echoue
        // (recapitulatif de fin de seance, ecrans de statistiques).
        if (!(err instanceof HistoriqueUnavailableError)) throw err;
        console.warn("Entree en mode hors ligne :", err.message);
      }

      ctx.setUsername(username);
      ctx.navigate("home");
    } catch (err) {
      errorEl.textContent = err instanceof HistoriqueError ? err.message : "Erreur de connexion, reessaie";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrer";
    }
  });

  return () => {};
}
