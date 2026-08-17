// Tests du compteur de repetitions : `npm test`.
//
// Ce module est le coeur de l'application et la source des bugs constates
// en conditions reelles (repetitions non comptees, repetitions comptees a
// tort). Il est teste directement parce qu'il ne depend ni du DOM, ni de
// la camera, ni de MediaPipe : on lui injecte des angles.
//
// Les seuils utilises ici sont ceux des pompes (voir pushup.js).

import test from "node:test";
import assert from "node:assert/strict";
import { createAngleRepCounter } from "../src/core/exercises/angleRepCounter.js";

const THRESHOLDS = { downAngle: 100, upAngle: 150 };
const counter = () => createAngleRepCounter(THRESHOLDS);

// Genere une serie de pompes en triangle : descente puis remontee, sans
// pause, a la cadence demandee. framesPerRep = 36 correspond a environ
// 1,2 s par pompe a 30 images/seconde.
function pushups({ reps, framesPerRep = 36, lowAngle = 85, highAngle = 165, noise = 0 }) {
  const angles = [];
  const half = framesPerRep / 2;
  const span = highAngle - lowAngle;

  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < half; i++) angles.push(highAngle - (span * i) / half);
    for (let i = 0; i < half; i++) angles.push(lowAngle + (span * i) / half);
  }
  // Fin de serie : on reste bras tendus, comme dans la realite.
  for (let i = 0; i < 4; i++) angles.push(highAngle);

  return angles.map((angle) => angle + (Math.random() * 2 - 1) * noise);
}

function run(angles, { alignOk = true } = {}) {
  const rc = counter();
  const results = angles.map((angle) => rc.evaluate({ primaryAngle: angle, alignOk }));
  return { rc, results };
}

test("compte des pompes propres", () => {
  const { rc } = run(pushups({ reps: 10 }));
  assert.equal(rc.count, 10);
});

test("reste exact malgre le bruit de detection", () => {
  // Le bruit de MediaPipe faisait apparaitre ou disparaitre des
  // repetitions avant le lissage : on verifie sur plusieurs tirages.
  for (let essai = 0; essai < 30; essai++) {
    const { rc } = run(pushups({ reps: 10, noise: 8 }));
    assert.equal(rc.count, 10, "comptage errone avec du bruit");
  }
});

test("ne compte rien quand l'angle oscille autour d'un seuil", () => {
  // Immobile bras presque tendus : aucune repetition ne doit apparaitre.
  const angles = Array.from({ length: 500 }, () => THRESHOLDS.upAngle + (Math.random() * 20 - 10));
  const { rc } = run(angles);
  assert.equal(rc.count, 0);
});

test("compte la repetition meme si le dos se creuse", () => {
  // L'alignement est un avertissement, pas un motif d'annulation : une
  // hanche mal detectee ne doit plus faire perdre de repetitions.
  const { rc, results } = run(pushups({ reps: 3 }), { alignOk: false });
  assert.equal(rc.count, 3);
  assert.ok(
    results.some((r) => r.code === "form_broken"),
    "l'utilisateur doit quand meme etre averti"
  );
});

test("ne compte pas les demi-pompes", () => {
  const { rc } = run(pushups({ reps: 5, lowAngle: 120 }));
  assert.equal(rc.count, 0);
});

test("signale une descente trop courte plutot que de l'ignorer", () => {
  const { results } = run(pushups({ reps: 1, lowAngle: 120 }));
  const shallow = results.find((r) => r.code === "shallow_rep");
  assert.ok(shallow, "une tentative trop haute doit etre signalee");
  assert.ok(
    shallow.attemptMinAngle > THRESHOLDS.downAngle,
    "l'angle atteint doit etre remonte pour que l'utilisateur sache de combien il a manque"
  );
});

test("expose l'amplitude reellement atteinte", () => {
  const { rc } = run(pushups({ reps: 2, lowAngle: 80 }));
  assert.equal(rc.count, 2);
  assert.ok(rc.lastRepMinAngle <= THRESHOLDS.downAngle);
  assert.ok(rc.lastRepMinAngle >= 75, "le lissage ne doit pas deformer l'amplitude mesuree");
});

test("reste fiable sur toutes les cadences humaines", () => {
  // Le lissage introduit un retard : on verifie qu'il ne fait pas perdre
  // de repetitions, meme tres rapides (0,5 s par pompe).
  for (const framesPerRep of [60, 36, 24, 15]) {
    for (let essai = 0; essai < 10; essai++) {
      const { rc } = run(pushups({ reps: 10, framesPerRep, noise: 6 }));
      assert.equal(rc.count, 10, `comptage errone a ${framesPerRep} images par repetition`);
    }
  }
});

test("ne fabrique pas de repetition apres une perte de suivi", () => {
  const rc = counter();
  for (const angle of [165, 160, 120, 95, 90]) rc.evaluate({ primaryAngle: angle, alignOk: true });

  rc.noteTrackingLost();

  // Retour dans le cadre en position haute : aucune repetition ne doit
  // etre validee pour la descente interrompue.
  for (let i = 0; i < 6; i++) rc.evaluate({ primaryAngle: 165, alignOk: true });
  assert.equal(rc.count, 0);
});

test("remet tout a zero", () => {
  const rc = counter();
  for (const angle of pushups({ reps: 3 })) rc.evaluate({ primaryAngle: angle, alignOk: true });
  assert.equal(rc.count, 3);

  rc.reset();
  assert.equal(rc.count, 0);
  assert.equal(rc.stage, "up");
  assert.equal(rc.lastRepMinAngle, null);
});
