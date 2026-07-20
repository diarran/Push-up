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
    <div id="threeContainer" class="threeContainer"></div>
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

  const rig = buildRig();
  scene.add(rig.root);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.4, 0.55);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight);
    composer.setSize(clientWidth, clientHeight);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // Un geste de l'utilisateur (glisser pour pivoter) suspend la rotation
  // automatique, pour ne pas lutter contre OrbitControls.
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
  });

  let rafId = null;
  const clock = new THREE.Clock();
  function animate() {
    const elapsed = clock.getElapsedTime();
    applyClip(rig, clip, elapsed);
    controls.update();
    composer.render();
    rafId = requestAnimationFrame(animate);
  }
  resize();
  animate();

  continueBtn.addEventListener("click", () => ctx.navigate("session"));

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
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
