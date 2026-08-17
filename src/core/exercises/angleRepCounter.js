// Machine a etats generique pour tout exercice "en repetitions" pilote par
// un angle articulaire principal (coude, genou...) et un controle de forme
// optionnel (alignement). Utilisee par pompes, squats, fentes.
//
// Fiabilisation contre le bruit de detection MediaPipe (repetitions
// fantomes ou perdues constatees en conditions reelles) :
// - lissage exponentiel (EMA) de l'angle principal : une frame aberrante
//   ne peut plus declencher un changement d'etat a elle seule
// - confirmation sur plusieurs frames consecutives avant tout changement
//   d'etat haut/bas (anti-rebond) : supprime les repetitions fantomes
//   quand l'angle oscille autour d'un seuil
// - le controle de forme est un avertissement, il n'invalide jamais la
//   repetition : une hanche brievement mal detectee ne fait plus perdre
//   de reps
//
// evaluate() attend { primaryAngle, alignOk } et retourne un code neutre
// (ready, go_lower, bottom_reached, hold_bottom, lock_out, form_broken,
// rep_success) : chaque exercice traduit ces codes en messages adaptes
// (voir pushup.js / squat.js / lunge.js).

// Amplitude minimale, en degres sous le seuil haut, a partir de laquelle on
// considere qu'il y a eu une tentative de repetition (et non un simple
// tremblement de detection). Sert a signaler les descentes trop courtes.
const ATTEMPT_MARGIN = 20;

export function createAngleRepCounter({ downAngle, upAngle, smoothing = 0.45, confirmFrames = 2 }) {
  let stage = "up"; // "up" | "down"
  let count = 0;
  let smoothedAngle = null;
  let downStreak = 0;
  let upStreak = 0;

  // Angle le plus bas atteint depuis le dernier passage en position haute :
  // permet de dire a l'utilisateur jusqu'ou il est reellement descendu,
  // plutot que de le laisser deviner pourquoi une repetition n'a pas
  // compte.
  let attemptMinAngle = Infinity;
  let lastRepMinAngle = null;

  function reset() {
    stage = "up";
    count = 0;
    smoothedAngle = null;
    downStreak = 0;
    upStreak = 0;
    attemptMinAngle = Infinity;
    lastRepMinAngle = null;
  }

  // A appeler quand le suivi est perdu (corps hors cadre) : repart d'un
  // lissage vierge pour ne pas melanger l'angle d'avant la perte avec
  // celui du retour dans le cadre.
  function noteTrackingLost() {
    smoothedAngle = null;
    downStreak = 0;
    upStreak = 0;
    attemptMinAngle = Infinity;
  }

  function evaluate({ primaryAngle, alignOk }) {
    smoothedAngle =
      smoothedAngle === null ? primaryAngle : smoothing * primaryAngle + (1 - smoothing) * smoothedAngle;
    attemptMinAngle = Math.min(attemptMinAngle, smoothedAngle);

    let result;

    if (stage === "up") {
      upStreak = 0;
      if (smoothedAngle <= downAngle) {
        downStreak++;
        if (downStreak >= confirmFrames) {
          stage = "down";
          downStreak = 0;
          result = { code: "bottom_reached", type: "neutral" };
        } else {
          result = { code: "go_lower", type: "neutral" };
        }
      } else {
        downStreak = 0;
        if (smoothedAngle >= upAngle) {
          // Retour en position haute sans jamais avoir atteint le bas : si
          // une vraie descente a eu lieu, c'est une repetition manquee de
          // peu, et l'utilisateur doit savoir de combien.
          const attempted = attemptMinAngle <= upAngle - ATTEMPT_MARGIN;
          result = attempted
            ? { code: "shallow_rep", type: "warning", attemptMinAngle }
            : { code: "ready", type: "neutral" };
          attemptMinAngle = smoothedAngle;
        } else {
          result = { code: "go_lower", type: "neutral" };
        }
      }
    } else {
      downStreak = 0;
      if (smoothedAngle >= upAngle) {
        upStreak++;
        if (upStreak >= confirmFrames) {
          stage = "up";
          upStreak = 0;
          count++;
          lastRepMinAngle = attemptMinAngle;
          attemptMinAngle = smoothedAngle;
          result = { code: "rep_success", type: "success", repCompleted: true, lastRepMinAngle };
        } else {
          result = { code: "lock_out", type: "neutral" };
        }
      } else {
        upStreak = 0;
        result =
          smoothedAngle <= downAngle ? { code: "hold_bottom", type: "neutral" } : { code: "lock_out", type: "neutral" };
      }
    }

    // La forme cassee remplace seulement le message courant par un
    // avertissement ; elle ne bloque jamais le comptage. Le feedback de
    // reussite d'une repetition reste prioritaire.
    if (!alignOk && !result.repCompleted) {
      result = { code: "form_broken", type: "warning" };
    }

    return { stage, count, repCompleted: false, smoothedAngle, ...result };
  }

  return {
    evaluate,
    reset,
    noteTrackingLost,
    // Angle de coude le plus ferme atteint lors de la derniere repetition
    // validee : reference pour regler les seuils sur le terrain.
    get lastRepMinAngle() {
      return lastRepMinAngle;
    },
    get count() {
      return count;
    },
    get stage() {
      return stage;
    }
  };
}
