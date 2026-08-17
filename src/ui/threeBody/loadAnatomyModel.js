import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createHologramMaterial } from "./hologramMaterial.js";

// Charge le maillage anatomique reel (public/models/male_anatomy/) et lui
// applique le materiau hologramme de l'application, pour qu'il ait la meme
// identite visuelle que le reste des ecrans 3D.
//
// Le modele est monobloc : un seul materiau, aucun decoupage par muscle.
// Il sert donc uniquement de corps visible ; la selection des muscles
// continue de passer par les volumes de detection de buildBody.js (voir
// "Corps 3D" dans le README).
//
// Le fichier est volumineux (~8,5 Mo) : il est charge a la demande, depuis
// public/ (jamais bundle par Vite), et l'ecran reste utilisable pendant le
// chargement.

const MODEL_URL = `${import.meta.env.BASE_URL}models/male_anatomy/scene.gltf`;

// Gabarit cible, aligne sur celui des volumes de detection de buildBody.js
// (pieds au sol de la grille, tete un peu au-dessus de 4).
const TARGET_HEIGHT = 5.6;
const TARGET_BASE_Y = -1.5;

// Ajuste le modele au gabarit attendu par la scene, quelles que soient les
// unites et l'origine choisies par l'auteur du modele : on mesure sa boite
// englobante puis on met a l'echelle et on recentre. Evite d'avoir a coder
// en dur des valeurs propres a ce fichier precis.
function fitToScene(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  if (size.y > 0) {
    const scale = TARGET_HEIGHT / size.y;
    object.scale.setScalar(scale);
    object.position.set(-center.x * scale, TARGET_BASE_Y - box.min.y * scale, -center.z * scale);
  }
}

export async function loadAnatomyModel() {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
  const object = gltf.scene;

  const materials = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    // Le materiau d'origine (PBR gris) est remplace, pas modifie : le
    // rendu doit rester coherent avec le shader hologramme partage.
    child.material.dispose();
    const material = createHologramMaterial();
    child.material = material;
    materials.push(material);
  });

  fitToScene(object);

  function dispose() {
    object.traverse((child) => {
      if (child.isMesh) child.geometry.dispose();
    });
    for (const material of materials) material.dispose();
  }

  return { object, dispose };
}
