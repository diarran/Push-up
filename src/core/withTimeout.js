// Empeche un appel reseau lent ou bloque de figer indefiniment l'interface.
// A utiliser pour tout appel dont l'echec ne doit pas empecher l'utilisateur
// de continuer (historique, enregistrement de fin de seance...).
export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}
