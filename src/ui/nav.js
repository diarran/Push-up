export function renderTopNav(active, ctx) {
  const nav = document.createElement("div");
  nav.className = "topNav";
  nav.innerHTML = `
    <button class="navTab${active === "home" ? " active" : ""}" data-nav="home">Accueil</button>
    <button class="navTab${active === "progress" ? " active" : ""}" data-nav="progress">Progression</button>
    <button class="navTab${active === "leaderboard" ? " active" : ""}" data-nav="leaderboard">Classement</button>
  `;
  nav.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => ctx.navigate(btn.dataset.nav));
  });
  return nav;
}
