import { escapeHtml } from "./escapeHtml.js";

// L'onglet Administration n'apparait que pour le compte marque
// administrateur. Ce n'est qu'un confort d'affichage : les actions de
// moderation exigent le code, verifie par la base.
export function renderTopNav(active, ctx) {
  const nav = document.createElement("div");
  nav.className = "topNav";

  const tabs = [
    { id: "home", label: "Accueil" },
    { id: "progress", label: "Progression" },
    { id: "leaderboard", label: "Classement" }
  ];
  if (typeof ctx.isAdmin === "function" && ctx.isAdmin()) {
    tabs.push({ id: "admin", label: "Admin" });
  }

  nav.innerHTML = tabs
    .map(
      (tab) =>
        `<button class="navTab${active === tab.id ? " active" : ""}" data-nav="${tab.id}">${escapeHtml(tab.label)}</button>`
    )
    .join("");

  nav.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => ctx.navigate(btn.dataset.nav));
  });
  return nav;
}
