// Catalogue des messages vocaux du coach. Textes uniquement, aucun symbole.

export const START_LINES = [
  "Serie prete. Premiere repetition quand tu veux.",
  "C'est parti. Controle ta descente.",
  "Debut de serie. Respire et vas-y."
];

export const ENCOURAGEMENT_LINES = [
  "Allez, continue comme ca.",
  "Lache rien.",
  "Belle regularite, on garde ce rythme.",
  "Encore un effort.",
  "Tu tiens le rythme, continue.",
  "Concentre toi sur la respiration."
];

export function sessionEndLine(totalReps) {
  if (totalReps <= 0) return "Serie terminee.";
  const word = totalReps > 1 ? "repetitions" : "repetition";
  return `Serie terminee. ${totalReps} ${word}.`;
}

export function exerciseIntroLine(label, setIndex, totalSets) {
  return `${label}. Serie ${setIndex} sur ${totalSets}.`;
}

export function nextExerciseLine(label) {
  return `Prochain exercice : ${label}.`;
}

export function workoutCompleteLine(exerciseCount) {
  if (exerciseCount <= 0) return "Seance terminee.";
  const word = exerciseCount > 1 ? "exercices" : "exercice";
  return `Seance terminee. ${exerciseCount} ${word} au programme, bravo.`;
}
