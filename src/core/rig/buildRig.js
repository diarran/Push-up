import * as THREE from "three";
import { createHologramMaterial } from "../../ui/threeBody/hologramMaterial.js";

// Rig simplifie a fins d'animation. Meme identite visuelle que le corps
// de ciblage (src/ui/threeBody/buildBody.js, meme materiau hologramme),
// mais structure differemment : le tronc, les jambes et la tete restent
// des meshes statiques (positions absolues), tandis que les bras sont de
// vrais pivots articules (epaule -> coude) pour pouvoir etre animes par
// src/core/rig/animateRig.js. D'autres articulations (hanche, genou)
// pourront etre ajoutees suivant le meme principe pour animer squats et
// fentes.
function taggedMesh(geometry, muscleId) {
  const mesh = new THREE.Mesh(geometry, createHologramMaterial());
  mesh.userData.muscleId = muscleId;
  return mesh;
}

export function buildRig() {
  const root = new THREE.Group();
  const parts = [];

  function addStatic(muscleId, geometry, position) {
    const m = taggedMesh(geometry, muscleId);
    m.position.set(...position);
    root.add(m);
    parts.push(m);
    return m;
  }

  const head = taggedMesh(new THREE.SphereGeometry(0.45, 24, 24), null);
  head.position.set(0, 3.6, 0);
  root.add(head);
  parts.push(head);

  addStatic("pectoraux", new THREE.BoxGeometry(1.4, 1, 0.35), [0, 2.7, 0.35]);
  addStatic("dos", new THREE.BoxGeometry(1.4, 1, 0.35), [0, 2.7, -0.35]);
  addStatic("abdominaux", new THREE.BoxGeometry(1.1, 0.9, 0.3), [0, 1.75, 0.35]);
  addStatic("lombaires", new THREE.BoxGeometry(1.1, 0.9, 0.3), [0, 1.75, -0.35]);
  addStatic("fessiers", new THREE.BoxGeometry(1.1, 0.5, 0.4), [0, 1.05, -0.1]);

  for (const side of [-1, 1]) {
    addStatic("quadriceps", new THREE.CapsuleGeometry(0.24, 1.1, 4, 8), [side * 0.35, 0.35, 0.15]);
    addStatic("ischio_jambiers", new THREE.CapsuleGeometry(0.22, 1.1, 4, 8), [side * 0.35, 0.35, -0.15]);
    addStatic("mollets", new THREE.CapsuleGeometry(0.18, 0.9, 4, 8), [side * 0.35, -0.9, -0.05]);
  }

  // Bras articules : le pivot epaule porte le bras superieur et fait
  // pivoter tout le bras autour de l'epaule ; le pivot coude, enfant du
  // premier, porte l'avant-bras et ne fait pivoter que celui-ci.
  const pivots = {};

  for (const side of [-1, 1]) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.95, 3.0, 0);
    root.add(shoulderPivot);

    const upperArmBiceps = taggedMesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), "biceps");
    upperArmBiceps.position.set(0, -0.3, 0.1);
    shoulderPivot.add(upperArmBiceps);
    parts.push(upperArmBiceps);

    const upperArmTriceps = taggedMesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 8), "triceps");
    upperArmTriceps.position.set(0, -0.3, -0.1);
    shoulderPivot.add(upperArmTriceps);
    parts.push(upperArmTriceps);

    const elbowPivot = new THREE.Group();
    elbowPivot.position.set(0, -0.58, 0);
    shoulderPivot.add(elbowPivot);

    const forearm = taggedMesh(new THREE.CapsuleGeometry(0.14, 0.48, 4, 8), "triceps");
    forearm.position.set(0, -0.26, 0);
    elbowPivot.add(forearm);
    parts.push(forearm);

    // Epaule (sphere), au-dessus du pivot pour rester coherente visuellement
    // avec buildBody.js.
    const shoulderCap = taggedMesh(new THREE.SphereGeometry(0.32, 16, 16), "epaules");
    shoulderCap.position.set(0, 0.05, 0);
    shoulderPivot.add(shoulderCap);
    parts.push(shoulderCap);

    if (side < 0) {
      pivots.leftShoulder = shoulderPivot;
      pivots.leftElbow = elbowPivot;
    } else {
      pivots.rightShoulder = shoulderPivot;
      pivots.rightElbow = elbowPivot;
    }
  }

  return { root, parts, pivots };
}
