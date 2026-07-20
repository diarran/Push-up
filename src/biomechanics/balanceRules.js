import { MUSCLE_GROUPS, muscleLabel } from "./muscleGroups.js";

// Regle unique et volontairement simple pour ce MVP : pour chaque muscle
// selectionne qui a un ou plusieurs antagonistes declares, si aucun de ses
// antagonistes n'est selectionne, on previent d'un risque de desequilibre
// et on suggere de l'ajouter (ex. pectoraux sans dos).
export function analyzeBalance(selectedIds) {
  const selected = new Set(selectedIds);
  const warnings = [];
  const suggestedIds = new Set();

  for (const id of selectedIds) {
    const group = MUSCLE_GROUPS[id];
    if (!group || group.antagonists.length === 0) continue;

    const missing = group.antagonists.filter((a) => !selected.has(a));
    if (missing.length === 0) continue;

    for (const m of missing) suggestedIds.add(m);

    warnings.push({
      muscleId: id,
      message: `${muscleLabel(id)} cible sans ${missing.map(muscleLabel).join(" ni ")} : risque de desequilibre postural.`
    });
  }

  return {
    warnings,
    suggestions: Array.from(suggestedIds).map((id) => ({ id, label: muscleLabel(id) }))
  };
}
