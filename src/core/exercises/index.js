import { pushupExercise } from "./pushup.js";
import { squatExercise } from "./squat.js";
import { lungeExercise } from "./lunge.js";
import { plankExercise } from "./plank.js";

export const EXERCISES = {
  [pushupExercise.id]: pushupExercise,
  [squatExercise.id]: squatExercise,
  [lungeExercise.id]: lungeExercise,
  [plankExercise.id]: plankExercise
};

export function getExercise(id) {
  const exercise = EXERCISES[id];
  if (!exercise) throw new Error(`Exercice inconnu : ${id}`);
  return exercise;
}

export function listExercises() {
  return Object.values(EXERCISES);
}

// Exercices dont au moins un muscle appartient a la selection donnee.
export function exercisesForMuscles(muscleIds) {
  const set = new Set(muscleIds);
  return listExercises().filter((exercise) => exercise.muscles.some((m) => set.has(m)));
}
