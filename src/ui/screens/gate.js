import { verifyPasscode, ScoresError } from "../../db/scores.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

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
      <label class="fieldLabel">
        Code d'acces du groupe
        <input type="password" id="passcodeInput" autocomplete="off" required />
      </label>
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

    const passcode = el.querySelector("#passcodeInput").value.trim();
    const username = el.querySelector("#usernameInput").value.trim();

    try {
      const valid = await verifyPasscode(passcode);
      if (!valid) throw new ScoresError("Code d'acces incorrect");
      if (!username) throw new ScoresError("Pseudo requis");

      ctx.setGroupSession({ passcode, username });
      ctx.navigate("home");
    } catch (err) {
      errorEl.textContent = err instanceof ScoresError ? err.message : "Erreur de connexion, reessaie";
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Entrer";
    }
  });

  return () => {};
}
