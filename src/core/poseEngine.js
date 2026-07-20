import { FilesetResolver, PoseLandmarker, DrawingUtils } from "@mediapipe/tasks-vision";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// Cree le detecteur de pose. Tente le delegue GPU (WebGL) pour la fluidite,
// puis retombe sur le CPU si l'appareil ne le supporte pas.
export async function createPoseLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

  const baseConfig = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1
  };

  try {
    return await PoseLandmarker.createFromOptions(fileset, baseConfig);
  } catch (err) {
    console.warn("Delegue GPU indisponible, bascule sur CPU", err);
    return await PoseLandmarker.createFromOptions(fileset, {
      ...baseConfig,
      baseOptions: { ...baseConfig.baseOptions, delegate: "CPU" }
    });
  }
}

export { PoseLandmarker, DrawingUtils };
