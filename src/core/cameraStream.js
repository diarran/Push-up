// Demarrage/arret du flux camera frontale. A appeler depuis un gestionnaire
// d'evenement declenche par l'utilisateur (obligatoire sur Safari iOS).
export async function startCameraStream(videoEl, { facingMode = "user", width = 720, height = 1280 } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: width }, height: { ideal: height } },
    audio: false
  });
  videoEl.srcObject = stream;
  await videoEl.play();
  return stream;
}

export function stopCameraStream(videoEl) {
  const stream = videoEl.srcObject;
  if (stream && stream.getTracks) {
    stream.getTracks().forEach((track) => track.stop());
  }
  videoEl.srcObject = null;
}
