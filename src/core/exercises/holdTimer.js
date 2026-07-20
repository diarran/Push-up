// Machine a etats generique pour tout exercice "en maintien" (planche...) :
// mesure le temps cumule pendant lequel la forme reste correcte, se met en
// pause (sans reinitialiser le total) des que la forme casse.
//
// evaluate() attend { alignOk }.

export function createHoldTimer() {
  let holding = false;
  let elapsedMs = 0;
  let lastTick = null;

  function reset() {
    holding = false;
    elapsedMs = 0;
    lastTick = null;
  }

  function evaluate({ alignOk }, now = performance.now()) {
    if (alignOk) {
      if (holding && lastTick !== null) elapsedMs += now - lastTick;
      holding = true;
      lastTick = now;
      return { code: "holding", type: "success", elapsedSeconds: Math.floor(elapsedMs / 1000) };
    }

    holding = false;
    lastTick = null;
    return { code: "form_broken", type: "warning", elapsedSeconds: Math.floor(elapsedMs / 1000) };
  }

  return {
    evaluate,
    reset,
    get elapsedSeconds() {
      return Math.floor(elapsedMs / 1000);
    },
    get holding() {
      return holding;
    }
  };
}
