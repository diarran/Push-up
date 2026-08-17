import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildBody, setMuscleHighlighted, updateHologramPulse, RIM_COLOR } from "../threeBody/buildBody.js";
import { loadAnatomyModel } from "../threeBody/loadAnatomyModel.js";
import { listMuscleGroups } from "../../biomechanics/muscleGroups.js";
import { escapeHtml } from "../escapeHtml.js";

const SCENE_BG = 0x05100c;

export function renderTargetingScreen(root, ctx) {
  const el = document.createElement("div");
  el.className = "screen targetingScreen";
  el.innerHTML = `
    <div class="targetingHeader">
      <h1>Choisis tes zones</h1>
      <p class="subtitle">Fais pivoter le corps, zoome, touche un muscle pour le cibler.</p>
    </div>
    <div id="threeContainer" class="threeContainer">
      <p id="modelStatus" class="modelStatus">Chargement du corps 3D</p>
    </div>
    <div class="targetingFooter">
      <div id="selectionList" class="selectionList"><span class="emptyState">Aucun muscle selectionne</span></div>
      <button id="continueBtn" class="primaryBtn" disabled>Continuer</button>
      <p class="modelCredit">Corps 3D : "Male anatomy figure" par C.J..Goldman (CC-BY-4.0)</p>
    </div>
  `;
  root.appendChild(el);

  const container = el.querySelector("#threeContainer");
  const selectionListEl = el.querySelector("#selectionList");
  const continueBtn = el.querySelector("#continueBtn");

  const selected = new Set(ctx.getMuscleSelection());
  const muscleLabels = new Map(listMuscleGroups().map((m) => [m.id, m.label]));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG);
  scene.fog = new THREE.FogExp2(SCENE_BG, 0.05);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2, 11);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 18;
  controls.update();

  // Grille technique au sol : pure ambiance "plateforme hologramme".
  const grid = new THREE.GridHelper(14, 28, RIM_COLOR.clone(), RIM_COLOR.clone());
  grid.position.y = -1.5;
  grid.material.transparent = true;
  grid.material.opacity = 0.18;
  scene.add(grid);

  // Volumes de detection des muscles : invisibles au repos, ils portent la
  // surbrillance des muscles selectionnes par-dessus le corps.
  const { group, parts } = buildBody();
  scene.add(group);

  for (const muscleId of selected) setMuscleHighlighted(parts, muscleId, true);

  // Corps visible : maillage anatomique reel, charge a la demande (~8,5 Mo)
  // pour ne pas retarder l'affichage de l'ecran.
  const statusEl = el.querySelector("#modelStatus");
  let anatomy = null;
  let disposed = false;

  loadAnatomyModel()
    .then((loaded) => {
      // L'utilisateur a pu quitter l'ecran pendant le chargement : dans ce
      // cas on libere immediatement, sans rien ajouter a une scene morte.
      if (disposed) {
        loaded.dispose();
        return;
      }
      anatomy = loaded;
      scene.add(anatomy.object);
      statusEl.remove();
    })
    .catch((err) => {
      console.error("Chargement du corps 3D impossible", err);
      if (disposed) return;
      // Repli : sans le maillage, on rend les volumes de detection visibles
      // pour que le ciblage reste utilisable.
      for (const mesh of parts) mesh.material.colorWrite = true;
      statusEl.textContent = "Corps 3D indisponible, affichage simplifie";
    });

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

  function renderSelectionList() {
    if (selected.size === 0) {
      selectionListEl.innerHTML = '<span class="emptyState">Aucun muscle selectionne</span>';
      continueBtn.disabled = true;
      return;
    }
    selectionListEl.innerHTML = Array.from(selected)
      .map((id) => `<span class="musclePill">${escapeHtml(muscleLabels.get(id) || id)}</span>`)
      .join("");
    continueBtn.disabled = false;
  }
  renderSelectionList();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownAt = null;

  function pointerPosition(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(event) {
    pointerDownAt = { x: event.clientX, y: event.clientY, t: performance.now() };
  }

  function onPointerUp(event) {
    if (!pointerDownAt) return;
    const movedPx = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y);
    const heldMs = performance.now() - pointerDownAt.t;
    pointerDownAt = null;
    // Ignore les gestes de rotation/zoom (glissement ou appui long) : ne
    // traite comme un "clic de selection" qu'un geste bref et quasi immobile.
    if (movedPx > 6 || heldMs > 350) return;

    pointerPosition(event);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(parts, false);
    if (hits.length === 0) return;

    const muscleId = hits[0].object.userData.muscleId;
    if (!muscleId) return;

    const isSelected = selected.has(muscleId);
    if (isSelected) selected.delete(muscleId);
    else selected.add(muscleId);
    setMuscleHighlighted(parts, muscleId, !isSelected);
    renderSelectionList();
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointerup", onPointerUp);

  let rafId = null;
  const clock = new THREE.Clock();
  function animate() {
    const elapsed = clock.getElapsedTime();
    grid.rotation.y = elapsed * 0.05;
    updateHologramPulse(parts, elapsed);
    controls.update();
    composer.render();
    rafId = requestAnimationFrame(animate);
  }
  resize();
  animate();

  continueBtn.addEventListener("click", () => {
    ctx.setMuscleSelection(Array.from(selected));
    ctx.navigate("workoutSetup");
  });

  return () => {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    if (anatomy) anatomy.dispose();
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    controls.dispose();
    bloomPass.dispose();
    composer.dispose();
    renderer.dispose();
    grid.geometry.dispose();
    grid.material.dispose();
    for (const part of parts) part.material.dispose();
  };
}
