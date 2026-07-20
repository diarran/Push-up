// Echappe une chaine avant insertion dans du HTML genere dynamiquement.
// Necessaire partout ou un pseudo libre (saisi par un utilisateur) est
// affiche, pour eviter toute injection HTML/JS via le champ pseudo.
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
