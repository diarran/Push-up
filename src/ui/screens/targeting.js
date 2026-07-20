import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildBody, setMuscleHighlighted } from "../threeBody/buildBody.js";
import { listMuscleGroups } from "../../biomechanics/muscleGroups.js";
import { escapeHtml } from "../escapeHtml.js";

export function renderTargetingScreen(root, ctx) {
  const el = document.createElement("div");
  el.className = "screen targetingScreen";
  el.innerHTML = `
    <div class="targetingHeader">
      <h1>Choisis tes zones</h1>
      <p class="subtitle">Fais pivoter le corps, zoome, touche un muscle pour le cibler.</p>
    </div>
    <div id="threeContainer" class="threeContainer"></div>
    <div class="targetingFooter">
      <div id="selectionList" class="selectionList"><span class="emptyState">Aucun muscle selectionne</span></div>
      <button id="continueBtn" class="primaryBtn" disabled>Continuer</button>
    </div>
  `;
  root.appendChild(el);

  const container = el.querySelector("#threeContainer");
  const selectionListEl = el.querySelector("#selectionList");
  const continueBtn = el.querySelector("#continueBtn");

  const selected = new Set(ctx.getMuscleSelection());
  const muscleLabels = new Map(listMuscleGroups().map((m) => [m.id, m.label]));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2, 7);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 12;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);

  const { group, parts } = buildBody();
  scene.add(group);

  for (const muscleId of selected) setMuscleHighlighted(parts, muscleId, true);

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (clientWidth === 0 || clientHeight === 0) return;
    renderer.setSize(clientWidth, clientHeight);
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
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(animate);
  }
  resize();
  animate();

  continueBtn.addEventListener("click", () => {
    ctx.setMuscleSelection(Array.from(selected));
    ctx.navigate("workoutSetup");
  });

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    controls.dispose();
    renderer.dispose();
    for (const part of parts) part.material.dispose();
  };
}
