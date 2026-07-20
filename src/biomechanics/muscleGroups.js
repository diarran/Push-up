// Taxonomie des groupes musculaires. Les identifiants correspondent aux
// noms de groupes du modele 3D (src/ui/threeBody/buildBody.js) et aux
// muscles declares par chaque exercice (src/core/exercises/*.js).
export const MUSCLE_GROUPS = {
  pectoraux: { label: "Pectoraux", region: "haut", antagonists: ["dos"] },
  dos: { label: "Dos", region: "haut", antagonists: ["pectoraux"] },
  epaules: { label: "Epaules", region: "haut", antagonists: [] },
  biceps: { label: "Biceps", region: "haut", antagonists: ["triceps"] },
  triceps: { label: "Triceps", region: "haut", antagonists: ["biceps"] },
  abdominaux: { label: "Abdominaux", region: "milieu", antagonists: ["lombaires"] },
  lombaires: { label: "Lombaires", region: "milieu", antagonists: ["abdominaux"] },
  quadriceps: { label: "Quadriceps", region: "bas", antagonists: ["ischio_jambiers"] },
  ischio_jambiers: { label: "Ischio-jambiers", region: "bas", antagonists: ["quadriceps"] },
  fessiers: { label: "Fessiers", region: "bas", antagonists: [] },
  mollets: { label: "Mollets", region: "bas", antagonists: [] }
};

export function muscleLabel(id) {
  return MUSCLE_GROUPS[id]?.label ?? id;
}

export function listMuscleGroups() {
  return Object.entries(MUSCLE_GROUPS).map(([id, group]) => ({ id, ...group }));
}
