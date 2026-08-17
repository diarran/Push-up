import * as THREE from "three";
import { createHologramMaterial, DEFAULT_RIM_COLOR } from "./hologramMaterial.js";

// Volumes de detection des muscles : des primitives simples (capsules,
// boites) posees aux emplacements anatomiques, groupees et nommees par
// muscle.
//
// Le corps *visible* est le maillage anatomique reel
// (loadAnatomyModel.js). Ce maillage est monobloc (un seul materiau, aucun
// decoupage par muscle) : il ne peut donc pas servir de cible de clic par
// muscle. Ces primitives jouent ce role a sa place :
// - invisibles au repos (colorWrite desactive) mais toujours cliquables,
//   le raycast les vise directement (voir targeting.js)
// - visibles et pulsantes une fois selectionnees : elles deviennent la
//   surbrillance du muscle cible par-dessus le corps
//
// Le reste de l'ecran ne depend que de mesh.userData.muscleId : le jour ou
// un maillage reellement segmente par muscle sera disponible, il pourra
// remplacer ces primitives sans toucher a targeting.js.

export const RIM_COLOR = DEFAULT_RIM_COLOR;
const SELECTED_GLOW_INTENSITY = 1.8;

function addPart(group, parts, muscleId, geometry, position) {
  const material = createHologramMaterial();
  // Invisible au repos, mais toujours pris en compte par le raycast :
  // colorWrite (et non `visible`) car un objet invisible ne serait plus
  // cliquable.
  material.colorWrite = false;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.muscleId = muscleId;
  mesh.userData.selected = false;
  mesh.position.set(...position);
  group.add(mesh);
  parts.push(mesh);
  return mesh;
}

export function buildBody() {
  const group = new THREE.Group();
  const parts = [];

  addPart(group, parts, "pectoraux", new THREE.BoxGeometry(1.4, 1, 0.35), [0, 2.7, 0.35]);
  addPart(group, parts, "dos", new THREE.BoxGeometry(1.4, 1, 0.35), [0, 2.7, -0.35]);
  addPart(group, parts, "abdominaux", new THREE.BoxGeometry(1.1, 0.9, 0.3), [0, 1.75, 0.35]);
  addPart(group, parts, "lombaires", new THREE.BoxGeometry(1.1, 0.9, 0.3), [0, 1.75, -0.35]);

  addPart(group, parts, "epaules", new THREE.SphereGeometry(0.32, 16, 16), [-0.95, 3.15, 0]);
  addPart(group, parts, "epaules", new THREE.SphereGeometry(0.32, 16, 16), [0.95, 3.15, 0]);

  for (const side of [-1, 1]) {
    addPart(group, parts, "biceps", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 1.15, 2.6, 0.12]);
    addPart(group, parts, "triceps", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 1.15, 2.6, -0.12]);
  }

  addPart(group, parts, "fessiers", new THREE.BoxGeometry(1.1, 0.5, 0.4), [0, 1.05, -0.1]);

  for (const side of [-1, 1]) {
    addPart(group, parts, "quadriceps", new THREE.CapsuleGeometry(0.24, 1.1, 4, 8), [side * 0.35, 0.35, 0.15]);
    addPart(group, parts, "ischio_jambiers", new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), [side * 0.35, 0.35, -0.15]);
  }

  for (const side of [-1, 1]) {
    addPart(group, parts, "mollets", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 0.35, -0.9, -0.05]);
  }

  return { group, parts };
}

export function setMuscleHighlighted(parts, muscleId, isSelected) {
  for (const mesh of parts) {
    if (mesh.userData.muscleId !== muscleId) continue;
    mesh.userData.selected = isSelected;
    mesh.material.colorWrite = isSelected;
  }
}

// A appeler a chaque frame : fait pulser doucement le glow des muscles
// selectionnes (effet "actif/scanne"), sans toucher aux muscles neutres.
export function updateHologramPulse(parts, elapsedSeconds) {
  const pulse = SELECTED_GLOW_INTENSITY * (0.7 + 0.3 * Math.sin(elapsedSeconds * 2.4));
  for (const mesh of parts) {
    if (mesh.userData.selected) mesh.material.uniforms.glowIntensity.value = pulse;
  }
}
