function lerp(a, b, t) {
  return a + (b - a) * t;
}

function sampleClip(clip, t) {
  const frames = clip.keyframes;
  let i = 0;
  while (i < frames.length - 2 && t > frames[i + 1].t) i++;
  const a = frames[i];
  const b = frames[i + 1];
  const span = b.t - a.t || 1;
  const localT = (t - a.t) / span;

  return {
    shoulder: lerp(a.shoulder, b.shoulder, localT),
    elbow: lerp(a.elbow, b.elbow, localT),
    bodyDrop: lerp(a.bodyDrop, b.bodyDrop, localT)
  };
}

// Applique le clip au rig pour un temps ecoule donne (boucle automatique
// sur la duree du clip). Ne connait rien de l'exercice en particulier :
// un clip est juste une timeline d'angles, comme dans core/exercises/,
// c'est la donnee (animationClips.js) qui varie, pas ce lecteur.
export function applyClip(rig, clip, elapsedSeconds) {
  const t = (elapsedSeconds % clip.duration) / clip.duration;
  const sample = sampleClip(clip, t);

  rig.root.position.y = sample.bodyDrop;

  const shoulderRad = (sample.shoulder * Math.PI) / 180;
  const elbowRad = (sample.elbow * Math.PI) / 180;

  if (rig.pivots.leftShoulder) rig.pivots.leftShoulder.rotation.x = shoulderRad;
  if (rig.pivots.rightShoulder) rig.pivots.rightShoulder.rotation.x = shoulderRad;
  if (rig.pivots.leftElbow) rig.pivots.leftElbow.rotation.x = elbowRad;
  if (rig.pivots.rightElbow) rig.pivots.rightElbow.rotation.x = elbowRad;
}
