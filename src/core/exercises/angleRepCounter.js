// Machine a etats generique pour tout exercice "en repetitions" pilote par
// un angle articulaire principal (coude, genou...) et un controle de forme
// optionnel (alignement). Utilisee par pompes, squats, fentes.
//
// evaluate() attend { primaryAngle, alignOk } et retourne un code neutre
// (ready, go_lower, bottom_reached, hold_bottom, lock_out, form_broken,
// rep_success) : chaque exercice traduit ces codes en messages adaptes
// (voir pushup.js / squat.js / lunge.js).

export function createAngleRepCounter({ downAngle, upAngle }) {
  let stage = "up"; // "up" | "down"
  let formBrokenThisRep = false;
  let count = 0;

  function reset() {
    stage = "up";
    formBrokenThisRep = false;
    count = 0;
  }

  function evaluate({ primaryAngle, alignOk }) {
    if (stage === "down" && !alignOk) formBrokenThisRep = true;

    let result;

    if (stage === "up") {
      if (primaryAngle <= downAngle) {
        stage = "down";
        formBrokenThisRep = !alignOk;
        result = alignOk ? { code: "bottom_reached", type: "neutral" } : { code: "form_broken", type: "warning" };
      } else if (primaryAngle < upAngle) {
        result = { code: "go_lower", type: "warning" };
      } else {
        result = { code: "ready", type: "neutral" };
      }
    } else {
      if (!alignOk) {
        result = { code: "form_broken", type: "warning" };
      } else if (primaryAngle <= downAngle) {
        result = { code: "hold_bottom", type: "neutral" };
      } else if (primaryAngle < upAngle) {
        result = { code: "lock_out", type: "warning" };
      } else {
        stage = "up";
        if (!formBrokenThisRep) {
          count++;
          result = { code: "rep_success", type: "success", repCompleted: true };
        } else {
          result = { code: "form_broken", type: "warning" };
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
