// Donnees d'animation par exercice : une serie de reperes temporels
// (0 a 1, boucle) avec, a chaque repere, l'angle des articulations
// concernees (en degres) et un decalage vertical global du corps
// (bodyDrop, en unites de scene). Interpolation lineaire entre reperes
// (voir animateRig.js).
//
// Ce n'est pas une capture de mouvement ni un rig biomecanique complet :
// une approximation stylisee suffisante pour montrer le sens du mouvement
// sous tous les angles (l'utilisateur fait pivoter la camera autour).
// Seules les pompes ont une animation pour l'instant ; les autres
// exercices utilisent le meme format et peuvent etre ajoutes sans changer
// le lecteur (voir README, section "Tutoriels animes").

export const ANIMATION_CLIPS = {
  pompes: {
    duration: 2.6,
    keyframes: [
      { t: 0, shoulder: 0, elbow: 0, bodyDrop: 0 },
      { t: 0.45, shoulder: -35, elbow: -75, bodyDrop: -0.55 },
      { t: 0.55, shoulder: -35, elbow: -75, bodyDrop: -0.55 },
      { t: 1, shoulder: 0, elbow: 0, bodyDrop: 0 }
    ]
  }
};
