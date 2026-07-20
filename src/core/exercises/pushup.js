import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createAngleRepCounter } from "./angleRepCounter.js";

export const pushupExercise = {
  id: "pompes",
  label: "Pompes",
  mode: "reps",
  muscles: ["pectoraux", "triceps", "epaules"],
  visThreshold: 0.55,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    elbow: [LM.L_ELBOW, LM.R_ELBOW],
    wrist: [LM.L_WRIST, LM.R_WRIST],
    hip: [LM.L_HIP, LM.R_HIP],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  createState: () => createAngleRepCounter({ downAngle: 90, upAngle: 160 }),
  computeMetrics(points) {
    const primaryAngle = angleAt(points.shoulder, points.elbow, points.wrist);
    const alignAngle = angleAt(points.shoulder, points.hip, points.ankle);
    return { primaryAngle, alignOk: alignAngle >= 160 };
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
