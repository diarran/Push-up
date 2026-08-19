// Tests de la regle de cloture d'une seance : `npm test`.
//
// La regle decide quand une video peut etre effacee. Se tromper dans un
// sens fait perdre une preuve encore utile, dans l'autre garde des fichiers
// pour rien. Elle est ecrite deux fois - en SQL (seance_close, qui fait
// foi) et ici pour l'affichage - donc autant verifier la version testable.

import test from "node:test";
import assert from "node:assert/strict";
import { isSessionClosed, VALIDATIONS_REQUISES, DELAI_CLOTURE_JOURS } from "../src/core/cloture.js";

const JOUR_MS = 24 * 60 * 60 * 1000;
const ilYA = (jours) => new Date(Date.now() - jours * JOUR_MS).toISOString();

test("une seance recente et non validee reste ouverte", () => {
  assert.equal(isSessionClosed({ createdAt: ilYA(1), validationCount: 0 }), false);
});

test("le delai seul suffit a clore", () => {
  assert.equal(isSessionClosed({ createdAt: ilYA(DELAI_CLOTURE_JOURS + 1), validationCount: 0 }), true);
});

test("juste avant le delai, la seance est encore ouverte", () => {
  assert.equal(isSessionClosed({ createdAt: ilYA(DELAI_CLOTURE_JOURS - 0.5), validationCount: 0 }), false);
});

test("assez de validations closent la seance sans attendre le delai", () => {
  assert.equal(isSessionClosed({ createdAt: ilYA(0), validationCount: VALIDATIONS_REQUISES }), true);
});

test("une validation de moins ne suffit pas", () => {
  assert.equal(isSessionClosed({ createdAt: ilYA(0), validationCount: VALIDATIONS_REQUISES - 1 }), false);
});

test("un signalement en attente empeche la cloture, meme apres le delai", () => {
  // C'est le cas important : sans cette regle, la video disparaitrait
  // exactement au moment ou l'administrateur en a besoin.
  assert.equal(
    isSessionClosed({ createdAt: ilYA(DELAI_CLOTURE_JOURS + 30), validationCount: 0, hasPendingReport: true }),
    false
  );
});

test("un signalement en attente prime aussi sur les validations", () => {
  assert.equal(
    isSessionClosed({
      createdAt: ilYA(0),
      validationCount: VALIDATIONS_REQUISES + 5,
      hasPendingReport: true
    }),
    false
  );
});
