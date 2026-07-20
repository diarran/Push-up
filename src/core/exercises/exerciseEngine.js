import { pickSideGeneric } from "../landmarks.js";
import { areVisible } from "../geometry.js";

// C'est ce module qui permet au moteur MediaPipe de "changer de logique"
// d'un exercice a l'autre : il ne connait rien de specifique a un exercice
// donne, il se contente d'appliquer la definition qu'on lui passe (points a
// suivre, calcul des angles, machine a etats, messages). Changer d'exercice
// en cours de seance revient a instancier un nouveau createExerciseEngine
// avec une autre definition (voir src/core/exercises/*.js).
//
// Chaque definition distingue deux groupes de points :
// - corePointKeys : indispensables au calcul de l'angle principal (ex.
//   epaule-coude-poignet pour les pompes). S'ils ne sont pas visibles,
//   aucune evaluation n'est possible.
// - formPointKeys : utilises pour le controle de forme (ex. alignement
//   epaule-hanche-cheville). S'ils ne sont pas assez visibles (chevilles
//   souvent hors cadre selon l'angle de camera), le controle de forme est
//   simplement ignore pour cette frame plutot que de bloquer tout le
//   comptage : mieux vaut valider une repetition sans verifier la forme
//   que ne jamais la valider parce qu'un pied depasse du cadre.
export function createExerciseEngine(exerciseDef) {
  const state = exerciseDef.createState();
  const visThreshold = exerciseDef.visThreshold ?? 0.5;
  let lastSide = null;

  function evaluate(landmarks) {
    const { side, points } = pickSideGeneric(landmarks, exerciseDef.points, lastSide);
    lastSide = side;

    const corePoints = exerciseDef.corePointKeys.map((key) => points[key]);
    if (!areVisible(corePoints, visThreshold)) {
      return { visible: false, message: "Recule-toi, corps entier visible", type: "neutral" };
    }

    const formPoints = exerciseDef.formPointKeys.map((key) => points[key]);
    const formVisible = areVisible(formPoints, visThreshold);

    const metrics = exerciseDef.computeMetrics(points, formVisible);
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
