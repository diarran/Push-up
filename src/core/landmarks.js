// Index des points de repere du modele PoseLandmarker (topologie a 33 points).
export const LM = {
  L_SHOULDER: 11,
  R_SHOULDER: 12,
  L_ELBOW: 13,
  R_ELBOW: 14,
  L_WRIST: 15,
  R_WRIST: 16,
  L_HIP: 23,
  R_HIP: 24,
  L_KNEE: 25,
  R_KNEE: 26,
  L_ANKLE: 27,
  R_ANKLE: 28
};

// pointSpec : { nomDuPoint: [indexGauche, indexDroit], ... }
// Choisit le cote (gauche ou droit) le plus visible globalement, puis
// retourne { nomDuPoint: landmark } pour ce cote. Chaque exercice definit
// son propre pointSpec (voir src/core/exercises/*.js).
export function pickSideGeneric(lms, pointSpec) {
  const visibilityOf = (p) => (p && p.visibility !== undefined ? p.visibility : 0);

  const sumSide = (side) =>
    Object.values(pointSpec).reduce((total, [left, right]) => total + visibilityOf(lms[side === "left" ? left : right]), 0);

  const side = sumSide("left") >= sumSide("right") ? "left" : "right";

  const points = {};
  for (const [name, [left, right]] of Object.entries(pointSpec)) {
    points[name] = lms[side === "left" ? left : right];
  }
  return points;
}
