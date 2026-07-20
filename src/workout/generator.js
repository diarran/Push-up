import { exercisesForMuscles, listExercises } from "../core/exercises/index.js";

// Preréglages par niveau. Pas de machine learning ici : des regles fixes,
// simples a ajuster.
const LEVEL_PRESETS = {
  debutant: { sets: 3, reps: 8, holdSeconds: 20, restSeconds: 45 },
  intermediaire: { sets: 3, reps: 12, holdSeconds: 30, restSeconds: 30 },
  avance: { sets: 4, reps: 15, holdSeconds: 45, restSeconds: 20 }
};

const SECONDS_PER_REP = 3;

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

function estimateBlockSeconds(block) {
  const workSeconds = block.mode === "hold" ? block.targetHoldSeconds : block.targetReps * SECONDS_PER_REP;
  return block.sets * (workSeconds + block.restSeconds);
}

// { muscleIds, minutes, level } -> { level, blocks, estimatedMinutes }
// blocks : [{ exerciseId, label, mode, muscles, sets, targetReps,
//             targetHoldSeconds, restSeconds }]
export function generateWorkout({ muscleIds, minutes, level = "intermediaire" }) {
  const preset = LEVEL_PRESETS[level] || LEVEL_PRESETS.intermediaire;

  let candidates = exercisesForMuscles(muscleIds || []);
  if (candidates.length === 0) candidates = listExercises(); // aucune selection -> circuit complet

  const blocks = candidates.map((exercise) => ({
    exerciseId: exercise.id,
    label: exercise.label,
    mode: exercise.mode,
    muscles: exercise.muscles,
    sets: preset.sets,
    targetReps: exercise.mode === "reps" ? preset.reps : null,
    targetHoldSeconds: exercise.mode === "hold" ? preset.holdSeconds : null,
    restSeconds: preset.restSeconds
  }));

  const budgetSeconds = Math.max(minutes, 1) * 60;
  const fitted = [];
  let usedSeconds = 0;

  for (const block of blocks) {
    const candidate = { ...block };
    let cost = estimateBlockSeconds(candidate);

    while (cost > budgetSeconds - usedSeconds && candidate.sets > 1) {
      candidate.sets -= 1;
      cost = estimateBlockSeconds(candidate);
    }

    if (cost <= budgetSeconds - usedSeconds) {
      fitted.push(candidate);
      usedSeconds += cost;
    }

    if (usedSeconds >= budgetSeconds) break;
  }

  if (fitted.length === 0 && blocks.length > 0) {
    const fallback = { ...blocks[0], sets: 1 };
    fitted.push(fallback);
    usedSeconds = estimateBlockSeconds(fallback);
  }

  return {
    level,
    blocks: fitted,
    estimatedMinutes: Math.round(usedSeconds / 60)
  };
}
