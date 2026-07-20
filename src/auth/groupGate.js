// Acces au groupe : verifie une seule fois contre un mot de passe partage
// (cote client), puis seul le pseudo est memorise localement pour ne pas
// redemander l'information a chaque visite. Aucun compte, aucun mot de
// passe individuel.

const STORAGE_KEY = "bsePushUp.username.v1";

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
}

export function checkGroupPasscode(passcode) {
  const expected = import.meta.env.VITE_GROUP_PASSCODE;
  return Boolean(expected) && passcode === expected;
}
