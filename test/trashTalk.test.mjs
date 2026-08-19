// Tests du trash talk : `npm test`.
//
// Ce qui compte ici n'est pas le texte des piques (il change au gre des
// envies) mais le classement des situations : une phrase de vainqueur
// affichee a quelqu'un qui est dernier serait ridicule. On teste donc
// l'analyse, et le fait que le rendu remplit bien les variables.

import test from "node:test";
import assert from "node:assert/strict";
import { analyseStanding, renderTrashTalk, trashTalkForRecap } from "../src/social/trashTalk.js";

// Choisit toujours la premiere ligne : les tests ne dependent pas du hasard.
const premiere = (lignes) => lignes[0];

function rows(...entries) {
  return entries.map(([username, totalReps, todayReps = totalReps]) => ({
    username,
    totalReps,
    todayReps,
    sessions: 1
  }));
}

test("pseudo absent du classement : aucune donnee", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 100]) });
  assert.equal(s.kind, "aucun");
});

test("classement vide : aucune donnee", () => {
  assert.equal(analyseStanding({ username: "Zoe", rows: [] }).kind, "aucun");
});

test("inscrit mais rien fait sur la periode : kind zero, et le leader est cite", () => {
  const s = analyseStanding({
    username: "Zoe",
    rows: rows(["Pedro", 100, 50], ["Zoe", 80, 0]),
    period: "today"
  });
  assert.equal(s.kind, "zero");
  assert.equal(s.leader, "Pedro");
  assert.equal(s.gap, 50);
});

test("premier avec une grosse avance : domination", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Zoe", 200], ["Pedro", 100]) });
  assert.equal(s.kind, "domination");
  assert.equal(s.rank, 1);
  assert.equal(s.gap, 100);
});

test("premier de peu : menace, et l'ecart designe le poursuivant", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Zoe", 105], ["Pedro", 100]) });
  assert.equal(s.kind, "menace");
  assert.equal(s.leader, "Pedro");
  assert.equal(s.gap, 5);
});

test("premier avec une avance moyenne : leader", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Zoe", 130], ["Pedro", 100]) });
  assert.equal(s.kind, "leader");
  assert.equal(s.gap, 30);
});

test("seul au classement : domination", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Zoe", 42]) });
  assert.equal(s.kind, "domination");
});

test("deuxieme a portee : proche", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 110], ["Zoe", 100]) });
  assert.equal(s.kind, "proche");
  assert.equal(s.rank, 2);
  assert.equal(s.gap, 10);
});

test("deuxieme largement distance : largue", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 200], ["Zoe", 100]) });
  assert.equal(s.kind, "largue");
  assert.equal(s.gap, 100);
});

test("deuxieme a distance moyenne : distance", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 130], ["Zoe", 100]) });
  assert.equal(s.kind, "distance");
});

test("dernier d'au moins trois : dernier, meme quand l'ecart est faible", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 110], ["Ana", 105], ["Zoe", 100]) });
  assert.equal(s.kind, "dernier");
  assert.equal(s.rank, 3);
  assert.equal(s.total, 3);
});

test("a deux, le dernier reste juge sur l'ecart", () => {
  const s = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 105], ["Zoe", 100]) });
  assert.equal(s.kind, "proche");
});

test("la periode du jour change le classement pris en compte", () => {
  const classement = rows(["Pedro", 500, 5], ["Zoe", 100, 80]);
  assert.equal(analyseStanding({ username: "Zoe", rows: classement, period: "total" }).kind, "largue");
  assert.equal(analyseStanding({ username: "Zoe", rows: classement, period: "today" }).kind, "domination");
});

test("le rendu remplit le pseudo et l'ecart", () => {
  const standing = analyseStanding({ username: "Zoe", rows: rows(["Pedro", 200], ["Zoe", 100]) });
  const ligne = renderTrashTalk(standing, premiere);
  assert.match(ligne, /Pedro/);
  assert.match(ligne, /100/);
  assert.ok(!ligne.includes("{"), `variable non remplacee dans : ${ligne}`);
});

test("toutes les situations produisent une phrase sans variable restante", () => {
  const cas = [
    { username: "Zoe", rows: [] },
    { username: "Zoe", rows: rows(["Pedro", 100], ["Zoe", 0]) },
    { username: "Zoe", rows: rows(["Zoe", 200], ["Pedro", 100]) },
    { username: "Zoe", rows: rows(["Zoe", 105], ["Pedro", 100]) },
    { username: "Zoe", rows: rows(["Zoe", 130], ["Pedro", 100]) },
    { username: "Zoe", rows: rows(["Pedro", 110], ["Zoe", 100]) },
    { username: "Zoe", rows: rows(["Pedro", 130], ["Zoe", 100]) },
    { username: "Zoe", rows: rows(["Pedro", 200], ["Zoe", 100]) },
    { username: "Zoe", rows: rows(["Pedro", 110], ["Ana", 105], ["Zoe", 100]) }
  ];

  for (const entree of cas) {
    const standing = analyseStanding(entree);
    // Chaque ligne du catalogue, pas seulement la premiere.
    for (let i = 0; i < 4; i++) {
      const ligne = renderTrashTalk(standing, (lignes) => lignes[i % lignes.length]);
      assert.ok(ligne && ligne.length > 0, `phrase vide pour ${standing.kind}`);
      assert.ok(!ligne.includes("{"), `variable non remplacee (${standing.kind}) : ${ligne}`);
    }
  }
});

test("recapitulatif : zero repetition a son propre ton", () => {
  const ligne = trashTalkForRecap({ reps: 0 }, premiere);
  assert.match(ligne, /Zero/i);
});

test("recapitulatif : un record prime sur le nombre de repetitions", () => {
  const record = trashTalkForRecap({ reps: 12, personalBest: 10 }, premiere);
  assert.match(record, /[Rr]ecord/);
  const sansRecord = trashTalkForRecap({ reps: 12, personalBest: 30 }, premiere);
  assert.ok(!/[Rr]ecord/.test(sansRecord), sansRecord);
});

test("recapitulatif : une premiere seance n'est pas annoncee comme un record", () => {
  const ligne = trashTalkForRecap({ reps: 12, personalBest: null }, premiere);
  assert.ok(!/[Rr]ecord/.test(ligne), ligne);
});

test("recapitulatif : le nombre de repetitions est injecte", () => {
  const ligne = trashTalkForRecap({ reps: 77 }, premiere);
  assert.match(ligne, /77/);
  assert.ok(!ligne.includes("{"), ligne);
});
