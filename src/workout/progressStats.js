import { localDateKey } from "../core/date.js";

// [{ reps, exerciseLabel, performedOn, createdAt }] -> [{ date, total }]
// Un point par jour sur les `days` derniers jours (les jours sans seance
// valent 0), toujours dans l'ordre chronologique : sert de base au
// graphique de tendance.
export function dailyTotals(sessions, days) {
  const totals = new Map();
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    totals.set(localDateKey(d), 0);
  }

  for (const s of sessions) {
    if (totals.has(s.performedOn)) {
      totals.set(s.performedOn, totals.get(s.performedOn) + s.reps);
    }
  }

  return Array.from(totals.entries()).map(([date, total]) => ({ date, total }));
}

// -> [{ label, total }] trie par total decroissant.
export function totalsByExercise(sessions) {
  const totals = new Map();
  for (const s of sessions) {
    totals.set(s.exerciseLabel, (totals.get(s.exerciseLabel) || 0) + s.reps);
  }
  return Array.from(totals.entries())
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

// La ligne (seance/exercice) individuelle la plus elevee sur la periode,
// ou null si aucune donnee.
export function bestSession(sessions) {
  return sessions.reduce((max, s) => (!max || s.reps > max.reps ? s : max), null);
}

// Nombre de jours consecutifs avec au moins une seance, en remontant
// depuis aujourd'hui.
export function computeStreak(sessions) {
  const days = new Set(sessions.map((s) => s.performedOn));
  let streak = 0;
  const cursor = new Date();
  while (days.has(localDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
