import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createAngleRepCounter } from "./angleRepCounter.js";

export const squatExercise = {
  id: "squats",
  label: "Squats",
  mode: "reps",
  muscles: ["quadriceps", "fessiers", "ischio_jambiers"],
  visThreshold: 0.5,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    hip: [LM.L_HIP, LM.R_HIP],
    knee: [LM.L_KNEE, LM.R_KNEE],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  // L'angle principal (genou) ne depend pas de l'epaule : si le buste
  // sort du cadre, on peut quand meme compter, juste sans le controle de
  // forme (torse).
  corePointKeys: ["hip", "knee", "ankle"],
  formPointKeys: ["shoulder", "hip", "knee"],
  createState: () => createAngleRepCounter({ downAngle: 100, upAngle: 165 }),
  computeMetrics(points, formVisible) {
    const primaryAngle = angleAt(points.hip, points.knee, points.ankle);
    const torsoAngle = formVisible ? angleAt(points.shoulder, points.hip, points.knee) : null;
    return { primaryAngle, alignOk: torsoAngle === null || torsoAngle >= 130 };
  },
  messages: {
    ready: "Pret",
    go_lower: "Descends plus bas",
    bottom_reached: "Bas, remonte",
    hold_bottom: "Bas, remonte",
    lock_out: "Tends les jambes",
    form_broken: "Redresse le buste",
    shallow_rep: "Pas assez bas, non comptee",
    rep_success: "Repetition validee"
  }
};
