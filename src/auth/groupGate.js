// Acces au groupe : verifie une seule fois contre un mot de passe partage
// (cote client), puis seul le pseudo est memorise localement pour ne pas
// redemander l'information a chaque visite.
//
// Depuis la migration 0003, chaque pseudo est protege par un code PIN
// verifie par la base (voir src/db/comptes.js). Le code lui-meme n'est
// jamais stocke ici : seul le pseudo l'est, et le drapeau "administrateur"
// qui ne sert qu'a afficher l'onglet correspondant. Toute action
// d'administration redemande le code et le fait verifier par la base.

const STORAGE_KEY = "bsePushUp.username.v1";
const ADMIN_KEY = "bsePushUp.isAdmin.v1";

export function loadUsername() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value : null;
  } catch (err) {
    return null;
  }
}

export function saveUsername(username) {
  localStorage.setItem(STORAGE_KEY, username);
}

export function clearUsername() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ADMIN_KEY);
}

// Confort d'affichage uniquement : ce drapeau n'autorise rien. Les
// operations d'administration exigent le code, verifie par la base.
export function loadIsAdmin() {
  try {
    return localStorage.getItem(ADMIN_KEY) === "1";
  } catch (err) {
    return false;
  }
}

export function saveIsAdmin(isAdmin) {
  try {
    if (isAdmin) localStorage.setItem(ADMIN_KEY, "1");
    else localStorage.removeItem(ADMIN_KEY);
  } catch (err) {
    /* stockage indisponible : l'onglet Administration ne sera pas propose */
  }
}

export function checkGroupPasscode(passcode) {
  const expected = import.meta.env.VITE_GROUP_PASSCODE;
  return Boolean(expected) && passcode === expected;
}
