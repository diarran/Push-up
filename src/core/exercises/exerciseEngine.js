import { pickSideGeneric } from "../landmarks.js";
import { areVisible } from "../geometry.js";

// C'est ce module qui permet au moteur MediaPipe de "changer de logique"
// d'un exercice a l'autre : il ne connait rien de specifique a un exercice
// donne, il se contente d'appliquer la definition qu'on lui passe (points a
// suivre, calcul des angles, machine a etats, messages). Changer d'exercice
// en cours de seance revient a instancier un nouveau createExerciseEngine
// avec une autre definition (voir src/core/exercises/*.js).
export function createExerciseEngine(exerciseDef) {
  const state = exerciseDef.createState();

  function evaluate(landmarks) {
    const points = pickSideGeneric(landmarks, exerciseDef.points);
    const pointList = Object.values(points);

    if (!areVisible(pointList, exerciseDef.visThreshold ?? 0.55)) {
      return { visible: false, message: "Recule-toi, corps entier visible", type: "neutral" };
    }

    const metrics = exerciseDef.computeMetrics(points);
    const result = state.evaluate(metrics);
    const message = exerciseDef.messages[result.code] || result.code;

    return { visible: true, ...result, message };
  }

  return {
    exerciseDef,
    evaluate,
    reset: state.reset,
    get count() {
      return state.count ?? 0;
    },
    get elapsedSeconds() {
      return state.elapsedSeconds ?? 0;
    }
  };
}
