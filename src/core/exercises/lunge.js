import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createAngleRepCounter } from "./angleRepCounter.js";

// Simplification assumee : suit l'angle du genou avant, comme un squat.
// Ne distingue pas encore la jambe avant de la jambe arriere ni la largeur
// de la fente ; suffisant pour compter des repetitions et surveiller le
// buste, mais moins precis qu'un squat pour la forme exacte du mouvement.
export const lungeExercise = {
  id: "fentes",
  label: "Fentes",
  mode: "reps",
  muscles: ["quadriceps", "fessiers", "ischio_jambiers"],
  visThreshold: 0.5,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    hip: [LM.L_HIP, LM.R_HIP],
    knee: [LM.L_KNEE, LM.R_KNEE],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  corePointKeys: ["hip", "knee", "ankle"],
  formPointKeys: ["shoulder", "hip", "knee"],
  createState: () => createAngleRepCounter({ downAngle: 100, upAngle: 165 }),
  computeMetrics(points, formVisible) {
    const primaryAngle = angleAt(points.hip, points.knee, points.ankle);
    const torsoAngle = formVisible ? angleAt(points.shoulder, points.hip, points.knee) : null;
    return { primaryAngle, alignOk: torsoAngle === null || torsoAngle >= 120 };
  },
  messages: {
    ready: "Pret",
    go_lower: "Descends plus bas",
    bottom_reached: "Bas, remonte",
    hold_bottom: "Bas, remonte",
    lock_out: "Tends la jambe",
    form_broken: "Garde le buste droit",
    shallow_rep: "Pas assez bas, non comptee",
    rep_success: "Repetition validee"
  }
};
