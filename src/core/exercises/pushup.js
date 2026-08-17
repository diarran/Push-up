import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createAngleRepCounter } from "./angleRepCounter.js";

export const pushupExercise = {
  id: "pompes",
  label: "Pompes",
  mode: "reps",
  muscles: ["pectoraux", "triceps", "epaules"],
  visThreshold: 0.5,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    elbow: [LM.L_ELBOW, LM.R_ELBOW],
    wrist: [LM.L_WRIST, LM.R_WRIST],
    hip: [LM.L_HIP, LM.R_HIP],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  // Indispensables pour compter : epaule-coude-poignet. Les chevilles
  // sortent souvent du cadre selon l'angle de camera ; ca ne doit pas
  // empecher de valider une repetition par ailleurs correcte.
  corePointKeys: ["shoulder", "elbow", "wrist"],
  formPointKeys: ["shoulder", "hip", "ankle"],
  // Seuils assouplis (100/150 au lieu de 90/160) : mesures de profil, les
  // angles extremes sont rarement atteints par le modele, ce qui faisait
  // perdre des repetitions pourtant completes.
  createState: () => createAngleRepCounter({ downAngle: 100, upAngle: 150 }),
  computeMetrics(points, formVisible) {
    const primaryAngle = angleAt(points.shoulder, points.elbow, points.wrist);
    const alignAngle = formVisible ? angleAt(points.shoulder, points.hip, points.ankle) : null;
    return { primaryAngle, alignOk: alignAngle === null || alignAngle >= 150 };
  },
  messages: {
    ready: "Pret",
    go_lower: "Descends plus bas",
    bottom_reached: "Bas, remonte",
    hold_bottom: "Bas, remonte",
    lock_out: "Tends les bras",
    form_broken: "Gaine ton bassin",
    rep_success: "Repetition validee"
  }
};
