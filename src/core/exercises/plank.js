import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createHoldTimer } from "./holdTimer.js";

export const plankExercise = {
  id: "planche",
  label: "Planche",
  mode: "hold",
  muscles: ["abdominaux", "lombaires", "epaules"],
  visThreshold: 0.5,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    hip: [LM.L_HIP, LM.R_HIP],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  // Ici, le controle de forme EST l'exercice : pas de repli possible si
  // un des trois points manque.
  corePointKeys: ["shoulder", "hip", "ankle"],
  formPointKeys: ["shoulder", "hip", "ankle"],
  createState: () => createHoldTimer(),
  computeMetrics(points) {
    const alignAngle = angleAt(points.shoulder, points.hip, points.ankle);
    return { alignOk: alignAngle >= 155 };
  },
  messages: {
    holding: "Gainage maintenu",
    form_broken: "Redresse le bassin"
  }
};
