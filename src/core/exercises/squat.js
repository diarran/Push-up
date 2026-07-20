import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createAngleRepCounter } from "./angleRepCounter.js";

export const squatExercise = {
  id: "squats",
  label: "Squats",
  mode: "reps",
  muscles: ["quadriceps", "fessiers", "ischio_jambiers"],
  visThreshold: 0.55,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    hip: [LM.L_HIP, LM.R_HIP],
    knee: [LM.L_KNEE, LM.R_KNEE],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  createState: () => createAngleRepCounter({ downAngle: 100, upAngle: 165 }),
  computeMetrics(points) {
    const primaryAngle = angleAt(points.hip, points.knee, points.ankle);
    const torsoAngle = angleAt(points.shoulder, points.hip, points.knee);
    return { primaryAngle, alignOk: torsoAngle >= 130 };
  },
  messages: {
    ready: "Pret",
    go_lower: "Descends plus bas",
    bottom_reached: "Bas, remonte",
    hold_bottom: "Bas, remonte",
    lock_out: "Tends les jambes",
    form_broken: "Redresse le buste",
    rep_success: "Repetition validee"
  }
};
