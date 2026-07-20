import * as THREE from "three";

// Corps stylise en primitives (capsules/boites), groupees et nommees par
// muscle. Ce n'est pas un maillage anatomique reel (voir README) : c'est un
// support d'interaction (rotation, zoom, clic, surbrillance) suffisant pour
// le ciblage, en attendant un eventuel maillage segmente reel qui se
// brancherait au meme endroit (le reste de l'ecran ne depend que de
// mesh.userData.muscleId, pas de la forme des meshes).

const BASE_COLOR = 0x2a2a2a;
export const HIGHLIGHT_COLOR = 0x00e676;

function addPart(group, parts, material, muscleId, geometry, position) {
  const mesh = new THREE.Mesh(geometry, material.clone());
  mesh.userData.muscleId = muscleId;
  mesh.position.set(...position);
  group.add(mesh);
  parts.push(mesh);
  return mesh;
}

export function buildBody() {
  const group = new THREE.Group();
  const parts = [];
  const baseMaterial = new THREE.MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.6, metalness: 0.1 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 24), baseMaterial.clone());
  head.position.set(0, 3.6, 0);
  group.add(head);

  addPart(group, parts, baseMaterial, "pectoraux", new THREE.BoxGeometry(1.4, 1, 0.35), [0, 2.7, 0.35]);
  addPart(group, parts, baseMaterial, "dos", new THREE.BoxGeometry(1.4, 1, 0.35), [0, 2.7, -0.35]);
  addPart(group, parts, baseMaterial, "abdominaux", new THREE.BoxGeometry(1.1, 0.9, 0.3), [0, 1.75, 0.35]);
  addPart(group, parts, baseMaterial, "lombaires", new THREE.BoxGeometry(1.1, 0.9, 0.3), [0, 1.75, -0.35]);

  addPart(group, parts, baseMaterial, "epaules", new THREE.SphereGeometry(0.32, 16, 16), [-0.95, 3.15, 0]);
  addPart(group, parts, baseMaterial, "epaules", new THREE.SphereGeometry(0.32, 16, 16), [0.95, 3.15, 0]);

  for (const side of [-1, 1]) {
    addPart(group, parts, baseMaterial, "biceps", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 1.15, 2.6, 0.12]);
    addPart(group, parts, baseMaterial, "triceps", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 1.15, 2.6, -0.12]);
  }

  addPart(group, parts, baseMaterial, "fessiers", new THREE.BoxGeometry(1.1, 0.5, 0.4), [0, 1.05, -0.1]);

  for (const side of [-1, 1]) {
    addPart(group, parts, baseMaterial, "quadriceps", new THREE.CapsuleGeometry(0.24, 1.1, 4, 8), [side * 0.35, 0.35, 0.15]);
    addPart(group, parts, baseMaterial, "ischio_jambiers", new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), [side * 0.35, 0.35, -0.15]);
  }

  for (const side of [-1, 1]) {
    addPart(group, parts, baseMaterial, "mollets", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 0.35, -0.9, -0.05]);
  }

  return { group, parts };
}

export function setMuscleHighlighted(parts, muscleId, isSelected) {
  for (const mesh of parts) {
    if (mesh.userData.muscleId !== muscleId) continue;
    mesh.material.emissive = new THREE.Color(isSelected ? HIGHLIGHT_COLOR : 0x000000);
    mesh.material.emissiveIntensity = isSelected ? 0.9 : 0;
  }
}
