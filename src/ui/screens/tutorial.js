import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildRig } from "../../core/rig/buildRig.js";
import { applyClip } from "../../core/rig/animateRig.js";
import { ANIMATION_CLIPS } from "../../core/rig/animationClips.js";
import { RIM_COLOR } from "../threeBody/buildBody.js";
import { loadPushupAnimation } from "../threeBody/loadPushupAnimation.js";
import { escapeHtml } from "../escapeHtml.js";

const SCENE_BG = 0x05100c;

export function renderTutorialScreen(root, ctx) {
  const plan = ctx.getWorkoutPlan();
  const firstBlock = plan && plan[0];
  const clip = firstBlock && ANIMATION_CLIPS[firstBlock.exerciseId];

  // Pas encore d'animation pour cet exercice (voir README, "Tutoriels
  // animes") : on ne bloque jamais le parcours, on passe directement a
  // la seance plutot que d'afficher un ecran vide.
  if (!firstBlock || !clip) {
    ctx.navigate("session");
    return () => {};
  }

  const el = document.createElement("div");
  el.className = "screen tutorialScreen";
  el.innerHTML = `
    <div class="targetingHeader">
      <h1>${escapeHtml(firstBlock.label)}</h1>
      <p class="subtitle">Fais pivoter pour observer la posture sous tous les angles.</p>
    </div>
    <div id="threeContainer" class="threeContainer">
      <p id="modelStatus" class="modelStatus">Chargement de la demonstration</p>
    </div>
    <div class="targetingFooter">
      <button id="continueBtn" class="primaryBtn">J'ai compris, commencer</button>
    </div>
  `;
  root.appendChild(el);

  const container = el.querySelector("#threeContainer");
  const continueBtn = el.querySelector("#continueBtn");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG);
  scene.fog = new THREE.FogExp2(SCENE_BG, 0.05);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2.2, 11);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.4, 0);
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 18;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  controls.update();

  const grid = new THREE.GridHelper(14, 28, RIM_COLOR.clone(), RIM_COLOR.clone());
  grid.position.y = -1.5;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  // Demonstration de repli : le pantin en primitives, affiche immediatement
  // pendant que le personnage anime (~35 Mo) se charge, et conserve si ce
  // chargement echoue.
  const rig = buildRig();
  scene.add(rig.root);

  const statusEl = el.querySelector("#modelStatus");
  let character = null;
  let disposed = false;
  let userAdjusted = false;

  loadPushupAnimation()
    .then((loaded) => {
      // L'utilisateur a pu quitter l'ecran pendant le chargement : on libere
      // sans rien ajouter a une scene morte.
      if (disposed) {
        loaded.dispose();
        return;
      }
      character = loaded;
      scene.remove(rig.root);
      scene.add(character.object);
      frameSubject();
      statusEl.remove();
    })
    .catch((err) => {
      console.error("Chargement de la demonstration animee impossible", err);
      if (disposed) return;
      statusEl.textContent = "Demonstration simplifiee (modele indisponible)";
    });

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.4, 0.55);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Direction de prise de vue : de trois quarts et legerement en hauteur,
  // l'angle sous lequel on juge le mieux l'alignement du dos.
  const VIEW_DIRECTION = new THREE.Vector3(0.55, 0.42, 1).normalize();

  // Pendant une pompe le corps est allonge : sur un ecran de telephone en
  // portrait, une distance fixe le couperait aux extremites. On calcule
  // donc le recul necessaire pour que le sujet tienne dans les deux
  // dimensions de l'ecran.
  function frameSubject() {
    // Une fois que l'utilisateur a pivote ou zoome, on ne touche plus a la
    // camera : sur mobile, la barre d'adresse qui se masque declenche un
    // redimensionnement, qui annulerait son geste en cours.
    if (!character || userAdjusted) return;
    const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
    const distanceForHeight = character.radius / Math.tan(halfFov);
    const distanceForWidth = distanceForHeight / Math.max(camera.aspect, 0.01);
    const distance = Math.max(distanceForHeight, distanceForWidth) * 1.15;

    controls.maxDistance = Math.max(18, distance * 1.6);
    controls.target.copy(character.center);
    camera.position.copy(character.center).addScaledVector(VIEW_DIRECTION, distance);
    controls.update();
  }

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight);
    composer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    frameSubject();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // Un geste de l'utilisateur (glisser pour pivoter) suspend la rotation
  // automatique et le cadrage automatique, pour ne pas lutter contre
  // OrbitControls.
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    userAdjusted = true;
  });

  let rafId = null;
  const clock = new THREE.Clock();
  let elapsed = 0;
  function animate() {
    const delta = clock.getDelta();
    elapsed += delta;
    // Le personnage anime est pilote par son AnimationMixer ; le pantin de
    // repli, par sa propre fonction d'animation.
    if (character) {
      character.mixer.update(delta);
    } else {
      applyClip(rig, clip, elapsed);
    }
    controls.update();
    composer.render();
    rafId = requestAnimationFrame(animate);
  }
  resize();
  animate();

  continueBtn.addEventListener("click", () => ctx.navigate("session"));

  return () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (character) character.dispose();
    resizeObserver.disconnect();
    controls.dispose();
    bloomPass.dispose();
    composer.dispose();
    renderer.dispose();
    grid.geometry.dispose();
    grid.material.dispose();
    for (const part of rig.parts) part.material.dispose();
  };
}
