import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createSkinnedHologramMaterial } from "./hologramMaterial.js";

// Charge le personnage anime des pompes et lui applique le materiau
// hologramme de l'application. Sert de demonstration du mouvement dans
// l'ecran de tutoriel, a la place du pantin approximatif de core/rig/.
//
// Le fichier est un glTF binaire produit a partir de l'export Mixamo
// d'origine par `scripts/fbx-to-glb.mjs` : sans les textures du
// personnage, inutiles ici, il pese 4,7 Mo au lieu de 33 Mo. Il est charge
// a la demande, depuis public/ (jamais bundle par Vite), et l'ecran
// affiche une demonstration de repli tant qu'il n'est pas pret.

const MODEL_URL = `${import.meta.env.BASE_URL}models/pushup_animation/pushup.glb`;

// Le personnage est a l'horizontale pendant une pompe : on ne peut pas
// caler sa taille sur sa hauteur (elle serait minuscule), on cale donc sa
// plus grande dimension sur le gabarit de la scene.
const TARGET_SIZE = 6;
const GROUND_Y = -1.5;

// Sujet a cadrer par la camera. Il est deduit du mouvement et non de la
// pose de repos : le fichier est fourni en T-pose debout, alors que
// l'animation se deroule au sol, a l'horizontale. Viser le centre de la
// pose de repos placerait la camera bien au-dessus du sujet reel.
const SUBJECT_CENTER_HEIGHT = 0.9; // au-dessus du sol, corps a plat
const SUBJECT_RADIUS = TARGET_SIZE * 0.62;

// Un export Mixamo contient souvent un clip technique vide ("Take 001") en
// plus du mouvement : on retient le premier clip qui anime reellement
// quelque chose, sinon le personnage resterait fige.
function pickAnimationClip(clips) {
  return (clips || []).find((clip) => clip.tracks.length > 0 && clip.duration > 0) || null;
}

function replaceMaterials(object) {
  const created = [];
  const originals = new Set();

  object.traverse((child) => {
    if (!child.isMesh) return;

    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (material) originals.add(material);
    }

    const material = createSkinnedHologramMaterial();
    child.material = material;
    created.push(material);

    // Les bornes calculees a la pose de repos ne couvrent pas toute
    // l'animation : sans ca, le personnage disparait a certains angles.
    child.frustumCulled = false;
  });

  // Les materiaux d'origine transportent les textures embarquees dans le
  // FBX, qui pesent l'essentiel du fichier : on les libere puisque le
  // rendu hologramme ne les utilise pas.
  for (const material of originals) {
    for (const value of Object.values(material)) {
      if (value && value.isTexture) value.dispose();
    }
    material.dispose();
  }

  return created;
}

// Met le modele a l'echelle de la scene et le pose sur la grille, quelles
// que soient les unites du fichier (Mixamo exporte en centimetres, pieds a
// l'origine). La mesure se fait sur la pose de repos : elle ne sert qu'a
// donner la bonne taille au personnage, le cadrage etant traite a part.
function fitToScene(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDimension = Math.max(size.x, size.y, size.z);
  if (maxDimension > 0) {
    object.scale.setScalar(TARGET_SIZE / maxDimension);
  }

  const scaledBox = new THREE.Box3().setFromObject(object);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);

  object.position.x -= center.x;
  object.position.z -= center.z;
  // Les pieds de la pose de repos reposent sur la grille ; l'animation
  // etant construite sur le meme plan de sol, le corps a plat s'y retrouve
  // aussi.
  object.position.y += GROUND_Y - scaledBox.min.y;
}

// onProgress : (pourcentage|null) - null quand la taille totale est
// inconnue. Le fichier est lourd : sans retour visible, un telechargement
// long est indiscernable d'un plantage.
export async function loadPushupAnimation(onProgress) {
  const gltf = await new GLTFLoader().loadAsync(MODEL_URL, (event) => {
    if (typeof onProgress !== "function") return;
    onProgress(event.lengthComputable && event.total > 0 ? (event.loaded / event.total) * 100 : null);
  });

  const object = gltf.scene;
  const materials = replaceMaterials(object);
  fitToScene(object);

  const mixer = new THREE.AnimationMixer(object);
  const clip = pickAnimationClip(gltf.animations);
  if (clip) mixer.clipAction(clip).play();

  function dispose() {
    mixer.stopAllAction();
    object.traverse((child) => {
      if (child.isMesh) child.geometry.dispose();
    });
    for (const material of materials) material.dispose();
  }

  return {
    object,
    mixer,
    hasAnimation: Boolean(clip),
    // Sujet a cadrer, exprime dans les coordonnees de la scene.
    center: new THREE.Vector3(0, GROUND_Y + SUBJECT_CENTER_HEIGHT, 0),
    radius: SUBJECT_RADIUS,
    dispose
  };
}
