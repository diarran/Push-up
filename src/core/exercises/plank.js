import { LM } from "../landmarks.js";
import { angleAt } from "../geometry.js";
import { createHoldTimer } from "./holdTimer.js";

export const plankExercise = {
  id: "planche",
  label: "Planche",
  mode: "hold",
  muscles: ["abdominaux", "lombaires", "epaules"],
  visThreshold: 0.55,
  points: {
    shoulder: [LM.L_SHOULDER, LM.R_SHOULDER],
    hip: [LM.L_HIP, LM.R_HIP],
    ankle: [LM.L_ANKLE, LM.R_ANKLE]
  },
  createState: () => createHoldTimer(),
  computeMetrics(points) {
    const alignAngle = angleAt(points.shoulder, points.hip, points.ankle);
    return { alignOk: alignAngle >= 160 };
  },
  messages: {
    holding: "Gainage maintenu",
    form_broken: "Redresse le bassin"
  }
};
