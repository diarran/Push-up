// Index des points de repere du modele PoseLandmarker (topologie a 33 points,
// identique a l'ancienne API MediaPipe Pose).
export const LM = {
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_ANKLE: 27,
  R_ANKLE: 28
};

// Choisit le cote (gauche ou droit) le plus visible pour l'utilisateur place de profil.
export function pickSide(lms) {
  const leftPts = [lms[LM.L_SHOULDER], lms[LM.L_ELBOW], lms[LM.L_WRIST], lms[LM.L_HIP], lms[LM.L_ANKLE]];
  const rightPts = [lms[LM.R_SHOULDER], lms[LM.R_ELBOW], lms[LM.R_WRIST], lms[LM.R_HIP], lms[LM.R_ANKLE]];
  const sum = (pts) => pts.reduce((s, p) => s + (p && p.visibility !== undefined ? p.visibility : 0), 0);

  return sum(leftPts) >= sum(rightPts)
    ? { shoulder: lms[LM.L_SHOULDER], elbow: lms[LM.L_ELBOW], wrist: lms[LM.L_WRIST], hip: lms[LM.L_HIP], ankle: lms[LM.L_ANKLE] }
    : { shoulder: lms[LM.R_SHOULDER], elbow: lms[LM.R_ELBOW], wrist: lms[LM.R_WRIST], hip: lms[LM.R_HIP], ankle: lms[LM.R_ANKLE] };
}
