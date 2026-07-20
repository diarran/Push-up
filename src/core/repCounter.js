// Machine a etats du coach IA : valide l'amplitude des coudes et l'alignement
// epaule-hanche-cheville, independamment de tout rendu (DOM, audio...).

export const DEFAULT_REP_CONFIG = {
  downAngle: 90, // coude plie a <= 90 degres : bas atteint
  upAngle: 160, // coude tendu a >= 160 degres : haut atteint (verrouillage)
  alignAngle: 160 // angle epaule-hanche-cheville mini pour considerer le dos droit
};

export function createRepCounter(config = DEFAULT_REP_CONFIG) {
  let stage = "up"; // "up" | "down"
  let formBrokenThisRep = false;
  let count = 0;

  function reset() {
    stage = "up";
    formBrokenThisRep = false;
    count = 0;
  }

  // Retourne { stage, count, repCompleted, code, message, type }
  // type vaut "neutral" | "warning" | "success"
  function evaluate(elbowAngle, alignOk) {
    if (stage === "down" && !alignOk) formBrokenThisRep = true;

    let result;

    if (stage === "up") {
      if (elbowAngle <= config.downAngle) {
        stage = "down";
        formBrokenThisRep = !alignOk;
        result = alignOk
          ? { code: "bottom_reached", message: "Bas, remonte", type: "neutral" }
          : { code: "hip_sag", message: "Gaine ton bassin", type: "warning" };
      } else if (elbowAngle < config.upAngle) {
        result = { code: "go_lower", message: "Descends plus bas", type: "warning" };
      } else {
        result = { code: "ready", message: "Pret", type: "neutral" };
      }
    } else {
      if (!alignOk) {
        result = { code: "hip_sag", message: "Gaine ton bassin", type: "warning" };
      } else if (elbowAngle <= config.downAngle) {
        result = { code: "hold_bottom", message: "Bas, remonte", type: "neutral" };
      } else if (elbowAngle < config.upAngle) {
        result = { code: "lock_out", message: "Tends les bras", type: "warning" };
      } else {
        stage = "up";
        if (!formBrokenThisRep) {
          count++;
          result = { code: "rep_success", message: "Repetition validee", type: "success", repCompleted: true };
        } else {
          result = { code: "hip_sag", message: "Gaine ton bassin", type: "warning" };
        }
        formBrokenThisRep = false;
      }
    }

    return { stage, count, repCompleted: false, ...result };
  }

  return {
    evaluate,
    reset,
    get count() {
      return count;
    },
    get stage() {
      return stage;
    }
  };
}
