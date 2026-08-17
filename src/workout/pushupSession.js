import { pushupExercise } from "../core/exercises/pushup.js";

// Seance "pompes uniquement", volontairement libre : une seule serie, sans
// objectif de repetitions, qui s'arrete quand l'utilisateur appuie sur
// Terminer. Tant que la fiabilite du comptage n'est pas validee en
// conditions reelles, un objectif chiffre et un enchainement de series
// ajouteraient du bruit a ce qu'on cherche a observer.
//
// Le generateur multi-exercices (src/workout/generator.js) et les autres
// exercices restent en place, simplement hors du parcours par defaut : y
// revenir consiste a rebrancher l'ecran de ciblage sur l'accueil (voir
// README, "Parcours reduit aux pompes").
export function createPushupSessionPlan() {
  return [
    {
      exerciseId: pushupExercise.id,
      label: pushupExercise.label,
      mode: "reps",
      muscles: pushupExercise.muscles,
      sets: 1,
      targetReps: null, // null = seance libre, aucun arret automatique
      targetHoldSeconds: null
    }
  ];
}
