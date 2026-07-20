// Acces au groupe : un mot de passe partage + un pseudo libre, memorises
// localement pour ne demander l'information qu'une seule fois par appareil.
// Aucun compte, aucun mot de passe individuel, aucune recuperation de compte.

const STORAGE_KEY = "bsePushUp.groupSession.v1";

export function loadGroupSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.passcode || !parsed.username) return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

export function saveGroupSession({ passcode, username }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ passcode, username }));
}

export function clearGroupSession() {
  localStorage.removeItem(STORAGE_KEY);
}
