import { exercisesForMuscles, listExercises } from "../core/exercises/index.js";

// Pas de machine learning ici : des regles fixes, simples a ajuster.
const SECONDS_PER_REP = 3;
const MIN_REPS = 5;
const MAX_REPS = 30;
const MIN_HOLD_SECONDS = 15;
const MAX_HOLD_SECONDS = 90;
const MIN_SETS = 1;
const MAX_SETS = 6;
const BASE_SETS_BY_LEVEL = { debutant: 3, intermediaire: 3, avance: 4 };

// Estime un niveau a partir des dernieres seances enregistrees (moyenne des
// repetitions sur les 5 dernieres). A defaut d'historique, niveau moyen par
// prudence. Le test d'evaluation devant la camera (alternative prevue) n'est
// pas encore implemente : cette fonction couvre la branche "historique".
export function deriveLevelFromHistory(sessions) {
  if (!sessions || sessions.length === 0) return "intermediaire";
  const recent = sessions.slice(0, 5);
  const average = recent.reduce((sum, s) => sum + s.reps, 0) / recent.length;
  if (average >= 20) return "avance";
  if (average <= 8) return "debutant";
  return "intermediaire";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Ajuste le nombre de series pour que la charge par serie (repetitions ou
// secondes de maintien) reste dans une plage raisonnable, compte tenu du
// temps alloue a cet exercice : moins de temps -> moins de series et/ou
// moins de charge par serie ; plus de temps -> davantage des deux, dans
// des bornes qui restent realistes.
function fitSetsAndLoad(exerciseSeconds, baseSets, unitSeconds, minLoad, maxLoad) {
  let sets = baseSets;
  let load = Math.round(exerciseSeconds / sets / unitSeconds);

  while (load < minLoad && sets > MIN_SETS) {
    sets -= 1;
    load = Math.round(exerciseSeconds / sets / unitSeconds);
  }
  while (load > maxLoad && sets < MAX_SETS) {
    sets += 1;
    load = Math.round(exerciseSeconds / sets / unitSeconds);
  }

  return { sets, load: clamp(load, minLoad, maxLoad) };
}

// { muscleIds, minutes, level } -> { level, blocks, estimatedMinutes }
// blocks : [{ exerciseId, label, mode, muscles, sets, targetReps,
//             targetHoldSeconds }]
//
// Le temps renseigne est reparti a parts egales entre les exercices
// retenus, puis converti en repetitions (ou secondes de maintien) par
// serie. Aucune pause n'est comptee entre les series : elles s'enchainent
// directement (voir session.js).
export function generateWorkout({ muscleIds, minutes, level = "intermediaire" }) {
  let candidates = exercisesForMuscles(muscleIds || []);
  if (candidates.length === 0) candidates = listExercises(); // aucune selection -> circuit complet

  const baseSets = BASE_SETS_BY_LEVEL[level] || BASE_SETS_BY_LEVEL.intermediaire;
  const totalSeconds = Math.max(minutes, 1) * 60;
  const secondsPerExercise = totalSeconds / candidates.length;

  const blocks = candidates.map((exercise) => {
    if (exercise.mode === "hold") {
      const { sets, load } = fitSetsAndLoad(secondsPerExercise, baseSets, 1, MIN_HOLD_SECONDS, MAX_HOLD_SECONDS);
      return {
        exerciseId: exercise.id,
        label: exercise.label,
        mode: "hold",
        muscles: exercise.muscles,
        sets,
        targetReps: null,
        targetHoldSeconds: load
      };
    }

    const { sets, load } = fitSetsAndLoad(secondsPerExercise, baseSets, SECONDS_PER_REP, MIN_REPS, MAX_REPS);
    return {
      exerciseId: exercise.id,
      label: exercise.label,
      mode: "reps",
      muscles: exercise.muscles,
      sets,
      targetReps: load,
      targetHoldSeconds: null
    };
  });

  const estimatedSeconds = blocks.reduce((sum, block) => {
    const workSeconds = block.mode === "hold" ? block.targetHoldSeconds : block.targetReps * SECONDS_PER_REP;
    return sum + block.sets * workSeconds;
  }, 0);

  return {
    level,
    blocks,
    estimatedMinutes: Math.round(estimatedSeconds / 60)
  };
}
