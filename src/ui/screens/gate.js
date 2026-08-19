import { checkGroupPasscode } from "../../auth/groupGate.js";
import { ensureUser, HistoriqueError, HistoriqueUnavailableError } from "../../db/historique.js";
import { fetchAccountState, setPin, verifyPin, isValidPin, PinNotSupportedError } from "../../db/comptes.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";
import { escapeHtml } from "../escapeHtml.js";

// Desactive temporairement le mot de passe de groupe (debogage en cours).
// Remettre a true pour retablir la protection : ca reaffiche le champ et
// reactive la verification, sans rien supprimer.
const PASSCODE_ENABLED = false;

// Entree en deux temps : d'abord le pseudo, ensuite le code PIN. Le
// deuxieme ecran depend de l'etat du compte, que seule la base connait :
//   compte inconnu          -> creation : choisir un code
//   compte avec code        -> connexion : saisir le code
//   compte sans code        -> adoption : poser un code sur un compte cree
//                              avant la migration 0003
//
// Si la base est injoignable ou que la migration 0003 n'a pas ete
// executee, on entre au pseudo seul, comme avant : compter des pompes ne
// doit jamais dependre du reseau.
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
      <label class="fieldLabel" id="usernameField">
        Pseudo
        <input type="text" id="usernameInput" autocomplete="off" maxlength="24" required />
      </label>
      <p class="fieldHint" id="gateHint">Garde toujours le meme pseudo : les seances s'additionnent par pseudo exact.</p>

      <div id="pinSection" hidden>
        <p class="gateIdentity" id="gateIdentity"></p>
        <label class="fieldLabel">
          <span id="pinLabel">Code</span>
          <input type="password" id="pinInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6" />
        </label>
        <label class="fieldLabel" id="pinConfirmField" hidden>
          Confirme le code
          <input type="password" id="pinConfirmInput" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6" />
        </label>
      </div>

      <button type="submit" id="gateSubmit" class="primaryBtn">Continuer</button>
      <button type="button" id="gateBackBtn" class="linkBtn" hidden>Changer de pseudo</button>
      <p id="gateError" class="errorText" hidden></p>
    </form>
  `;
  root.appendChild(el);

  const form = el.querySelector("#gateForm");
  const errorEl = el.querySelector("#gateError");
  const submitBtn = el.querySelector("#gateSubmit");
  const backBtn = el.querySelector("#gateBackBtn");
  const usernameField = el.querySelector("#usernameField");
  const usernameInput = el.querySelector("#usernameInput");
  const hintEl = el.querySelector("#gateHint");
  const pinSection = el.querySelector("#pinSection");
  const pinInput = el.querySelector("#pinInput");
  const pinLabel = el.querySelector("#pinLabel");
  const pinConfirmField = el.querySelector("#pinConfirmField");
  const pinConfirmInput = el.querySelector("#pinConfirmInput");
  const identityEl = el.querySelector("#gateIdentity");

  // "pseudo" | "creation" | "connexion" | "adoption"
  let step = "pseudo";
  let pendingUsername = "";
  let pendingIsAdmin = false;
  let pendingSessionCount = 0;

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function setBusy(busy, label) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? label : stepSubmitLabel();
  }

  function stepSubmitLabel() {
    if (step === "pseudo") return "Continuer";
    if (step === "connexion") return "Entrer";
    return "Creer le code";
  }

  // Fonction et non objet constant : le texte d'adoption depend du nombre
  // de seances du compte vise, qui n'est connu qu'apres la premiere etape.
  const textesPour = (etape) => ({
    creation: {
      hint: "Choisis un code de 4 a 6 chiffres. Il te sera demande a chaque connexion : c'est ce qui empeche quelqu'un d'autre d'entrer sous ton pseudo.",
      label: "Nouveau code (4 a 6 chiffres)",
      confirm: true
    },
    adoption: {
      // Poser un code sur un compte existant est le seul moyen de reprendre
      // la main sur un pseudo cree avant les codes PIN. C'est aussi, par
      // construction, le moyen de s'approprier le compte d'un autre : d'ou
      // l'avertissement explicite des qu'il y a un historique a perdre.
      hint:
        pendingSessionCount > 0
          ? `Attention : ce pseudo a deja ${pendingSessionCount} seance${
              pendingSessionCount > 1 ? "s" : ""
            } enregistree${pendingSessionCount > 1 ? "s" : ""}. Si ce n'est pas ton compte, reviens en arriere et choisis un autre pseudo. Sinon, pose ton code : il le protegera.`
          : "Ce compte existe mais n'a pas encore de code. Pose-en un maintenant pour le proteger.",
      label: "Nouveau code (4 a 6 chiffres)",
      confirm: true
    },
    connexion: {
      hint: "Saisis ton code pour entrer.",
      label: "Code",
      confirm: false
    }
  })[etape];

  function goToStep(next) {
    step = next;
    errorEl.hidden = true;

    if (next === "pseudo") {
      usernameField.hidden = false;
      pinSection.hidden = true;
      backBtn.hidden = true;
      hintEl.textContent = "Garde toujours le meme pseudo : les seances s'additionnent par pseudo exact.";
      submitBtn.textContent = stepSubmitLabel();
      usernameInput.focus();
      return;
    }

    const textes = textesPour(next);
    usernameField.hidden = true;
    pinSection.hidden = false;
    backBtn.hidden = false;
    identityEl.textContent = pendingUsername;
    hintEl.textContent = textes.hint;
    pinLabel.textContent = textes.label;
    pinConfirmField.hidden = !textes.confirm;
    pinInput.value = "";
    pinConfirmInput.value = "";
    submitBtn.textContent = stepSubmitLabel();
    pinInput.focus();
  }

  function enter(username, isAdmin) {
    ctx.setUsername(username, { isAdmin });
    ctx.navigate("home");
  }

  // Entree sans code : base injoignable, ou migration 0003 pas executee.
  // On garde le comportement d'origine plutot que de bloquer l'acces.
  async function enterWithoutPin(username, reason) {
    console.warn("Entree sans code :", reason);
    try {
      await ensureUser(username);
    } catch (err) {
      if (!(err instanceof HistoriqueUnavailableError)) throw err;
    }
    enter(username, false);
  }

  async function submitUsername() {
    const username = usernameInput.value.replace(/\s+/g, " ").trim();
    if (!username) throw new HistoriqueError("Pseudo requis");
    pendingUsername = username;

    let state;
    try {
      state = await fetchAccountState(username);
    } catch (err) {
      if (err instanceof PinNotSupportedError || err instanceof HistoriqueUnavailableError) {
        await enterWithoutPin(username, err.message);
        return;
      }
      throw err;
    }

    pendingIsAdmin = state.isAdmin;
    pendingSessionCount = state.sessionCount || 0;
    if (state.hasPin) goToStep("connexion");
    else if (state.exists) goToStep("adoption");
    else goToStep("creation");
  }

  async function submitPin() {
    const code = pinInput.value.trim();

    if (step === "connexion") {
      if (!code) throw new HistoriqueError("Code requis");
      const ok = await verifyPin(pendingUsername, code);
      if (!ok) throw new HistoriqueError("Code incorrect");
      enter(pendingUsername, pendingIsAdmin);
      return;
    }

    // Creation ou adoption : deux saisies identiques.
    if (!isValidPin(code)) throw new HistoriqueError("Le code doit contenir de 4 a 6 chiffres");
    if (code !== pinConfirmInput.value.trim()) throw new HistoriqueError("Les deux codes ne correspondent pas");

    await setPin(pendingUsername, code);
    enter(pendingUsername, pendingIsAdmin);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    setBusy(true, "Verification");

    try {
      if (step === "pseudo" && PASSCODE_ENABLED) {
        const passcode = el.querySelector("#passcodeInput").value.trim();
        if (!checkGroupPasscode(passcode)) throw new HistoriqueError("Code d'acces incorrect");
      }

      if (step === "pseudo") await submitUsername();
      else await submitPin();
    } catch (err) {
      if (err instanceof PinNotSupportedError) {
        // La migration a disparu entre les deux etapes : on laisse entrer.
        try {
          await enterWithoutPin(pendingUsername, err.message);
          return;
        } catch (fallbackErr) {
          showError("Erreur de connexion, reessaie");
        }
      } else if (err instanceof HistoriqueUnavailableError) {
        showError("Base hors ligne : impossible de verifier le code");
      } else if (err instanceof HistoriqueError) {
        showError(err.message);
      } else {
        console.error(err);
        showError("Erreur de connexion, reessaie");
      }
    } finally {
      setBusy(false);
    }
  });

  backBtn.addEventListener("click", () => {
    pendingUsername = "";
    pendingIsAdmin = false;
    pendingSessionCount = 0;
    goToStep("pseudo");
  });

  // Champs de code : chiffres uniquement, sans avoir a filtrer a la
  // validation (le clavier numerique n'empeche pas de coller du texte).
  [pinInput, pinConfirmInput].forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });
  });

  // Rappel discret de l'existence d'un compte d'administration : c'est ce
  // qui permet de retrouver l'ecran de moderation apres une reinstallation.
  el.insertAdjacentHTML(
    "beforeend",
    `<p class="gateFootnote">Compte de moderation : pseudo ${escapeHtml("Admin")}.</p>`
  );

  return () => {};
}
