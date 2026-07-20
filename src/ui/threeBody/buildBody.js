import * as THREE from "three";
import { createHologramMaterial, DEFAULT_RIM_COLOR } from "./hologramMaterial.js";

// Corps stylise en primitives (capsules/boites), groupees et nommees par
// muscle. Ce n'est pas un maillage anatomique reel (voir README) : c'est un
// support d'interaction (rotation, zoom, clic, surbrillance) suffisant pour
// le ciblage, en attendant un eventuel maillage segmente reel qui se
// brancherait au meme endroit (le reste de l'ecran ne depend que de
// mesh.userData.muscleId, pas de la forme des meshes).

export const RIM_COLOR = DEFAULT_RIM_COLOR;
const BASE_GLOW_INTENSITY = 0.4;
const SELECTED_GLOW_INTENSITY = 1.8;

function addPart(group, parts, muscleId, geometry, position) {
  const mesh = new THREE.Mesh(geometry, createHologramMaterial());
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

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), createHologramMaterial());
  head.position.set(0, 3.6, 0);
  group.add(head);

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
    if (!isSelected) mesh.material.uniforms.glowIntensity.value = BASE_GLOW_INTENSITY;
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
