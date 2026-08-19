// Trash talk : petites piques affichees selon la position au classement.
//
// Module volontairement pur (aucun DOM, aucun reseau) : il prend un
// classement deja charge et rend une phrase. C'est ce qui permet de le
// tester sans navigateur, et de le reutiliser sur l'accueil, le classement
// et le recapitulatif de fin de seance.
//
// Le ton est celui d'un groupe d'amis qui se chambre : ca tape fort, mais
// ca ne vise que la flemme et les scores, jamais la personne.

// Ecarts (en repetitions) qui font basculer d'une situation a l'autre.
const ECART_SERRE = 15;
const ECART_LARGE = 50;

// ---------------------------------------------------------------------
// Analyse : ou en est le joueur par rapport aux autres ?
// ---------------------------------------------------------------------

// rows : le classement tel que le renvoie fetchLeaderboard
//   [{ username, totalReps, todayReps, sessions }]
// period : "total" ou "today"
//
// Retourne { kind, reps, rank, total, leader, gap } ou kind vaut :
//   "aucun"      classement vide, ou le joueur n'y figure pas encore
//   "zero"       le joueur est inscrit mais n'a rien fait sur la periode
//   "domination" premier avec une avance ecrasante
//   "menace"     premier, mais le deuxieme colle aux basques
//   "leader"     premier, avance confortable
//   "proche"     pas premier, mais le leader est a portee
//   "distance"   pas premier, ecart moyen
//   "largue"     pas premier, ecart humiliant
//   "dernier"    bon dernier d'un classement d'au moins trois personnes
export function analyseStanding({ username, rows, period = "total" }) {
  const metric = (row) => (period === "today" ? row.todayReps : row.totalReps) || 0;

  const classement = (rows || [])
    .map((row) => ({ username: row.username, reps: metric(row) }))
    .sort((a, b) => b.reps - a.reps);

  const moi = classement.find((row) => row.username === username);
  if (!moi) return { kind: "aucun", reps: 0, rank: 0, total: classement.length, leader: null, gap: 0 };
  if (moi.reps <= 0) {
    const tete = classement.find((row) => row.reps > 0) || null;
    return {
      kind: "zero",
      reps: 0,
      rank: classement.length,
      total: classement.length,
      leader: tete ? tete.username : null,
      gap: tete ? tete.reps : 0
    };
  }

  const rank = classement.indexOf(moi) + 1;
  const total = classement.length;
  const leader = classement[0];

  if (rank === 1) {
    const second = classement[1];
    // Seul au classement : personne pour te chasser, mais personne pour
    // t'applaudir non plus.
    if (!second || second.reps <= 0) {
      return { kind: "domination", reps: moi.reps, rank, total, leader: null, gap: moi.reps };
    }
    const avance = moi.reps - second.reps;
    const kind = avance >= ECART_LARGE ? "domination" : avance <= ECART_SERRE ? "menace" : "leader";
    return { kind, reps: moi.reps, rank, total, leader: second.username, gap: avance };
  }

  const retard = leader.reps - moi.reps;
  let kind;
  if (total >= 3 && rank === total) kind = "dernier";
  else if (retard <= ECART_SERRE) kind = "proche";
  else if (retard >= ECART_LARGE) kind = "largue";
  else kind = "distance";

  return { kind, reps: moi.reps, rank, total, leader: leader.username, gap: retard };
}

// ---------------------------------------------------------------------
// Catalogue
//
// {leader} = le pseudo a battre (ou celui qui te colle au train quand tu es
// premier), {gap} = l'ecart en repetitions, {reps} = ton score.
// ---------------------------------------------------------------------

const LIGNES = {
  aucun: [
    "Zero pompe, zero excuse. Le classement se moque de toi, ptit con.",
    "T'es meme pas au classement. Tu existes au moins ?",
    "Ton nom est nulle part. Bouge ton cul et viens exister.",
    "Le canape a gagne. Felicitations, chien."
  ],
  zero: [
    "Reveille-toi ! {leader} a deja {gap} repetitions d'avance sur toi.",
    "Zero aujourd'hui. Zero. Tu te fous de qui, lopsa ?",
    "Pendant que tu scrollais, {leader} en a mis {gap}. Bien joue, champion du vide.",
    "Ton compteur est a zero et ta fierte aussi. Au boulot, ptit con."
  ],
  domination: [
    "Impressionnant, tu domines completement le classement. Ils mangent la poussiere.",
    "{reps} repetitions. Les autres sont des figurants, laisse-les pleurer.",
    "Tu leur mets {gap} d'ecart. C'est plus du sport, c'est de la maltraitance.",
    "Personne ne t'arrive a la cheville. Continue, chien, ecrase-les."
  ],
  menace: [
    "Attention, {leader} n'est qu'a {gap} repetitions. Ca sent le roussi.",
    "Premier de {gap} pompes. Autant dire rien. {leader} te renifle deja.",
    "Tu dors sur ta place ? {leader} arrive et il ne va pas frapper.",
    "{gap} d'avance, c'est une avance de lopsa. Creuse l'ecart ou degage."
  ],
  leader: [
    "Premier avec {gap} d'avance. Tiens la baraque, ils veulent ta place.",
    "Tu mene la danse. Reste dessus, la meute n'est pas loin.",
    "{reps} repetitions et le trone. Ne le lache pas, ptit con.",
    "Premier. Pour l'instant. Ne prends pas tes aises."
  ],
  proche: [
    "{leader} n'est qu'a {gap} repetitions. Une serie et tu lui passes dessus.",
    "Plus que {gap}. Tu vas quand meme pas t'arreter maintenant, chien.",
    "{gap} pompes te separent de la premiere place. Arrete de reflechir et fais-les.",
    "Tu sens le sang ? {leader} est a {gap}. Va le chercher."
  ],
  distance: [
    "{leader} te met {gap} repetitions dans la vue. Ca pique, non ?",
    "{gap} de retard. C'est pas de la malchance, c'est de la flemme.",
    "Toujours derriere {leader}. A un moment il va falloir se bouger, ptit con.",
    "{gap} repetitions a rattraper. Le sol t'attend."
  ],
  largue: [
    "Reveille-toi ! {leader} a deja {gap} repetitions d'avance sur toi.",
    "{gap} d'ecart avec {leader}. Tu ne cours plus la meme course, lopsa.",
    "{leader} t'a lache depuis longtemps. Toi tu regardes. Bravo, chien.",
    "{gap} repetitions de retard. Meme ton reflet a honte."
  ],
  dernier: [
    "Dernier. {leader} te met {gap} repetitions. Tu portes la lanterne, ptit con.",
    "Bon dernier sur {total}. Il faut vraiment le vouloir.",
    "Dernier du classement. Le sol est juste la, il ne mord pas.",
    "{total} participants, et toi tout au fond. Reveille-toi, chien."
  ]
};

function tirage(lignes, pick) {
  if (typeof pick === "function") return pick(lignes);
  return lignes[Math.floor(Math.random() * lignes.length)];
}

function remplir(modele, standing) {
  return modele
    .replaceAll("{leader}", standing.leader || "le premier")
    .replaceAll("{gap}", String(Math.max(0, Math.round(standing.gap))))
    .replaceAll("{reps}", String(Math.max(0, Math.round(standing.reps))))
    .replaceAll("{total}", String(standing.total));
}

// Rend la pique correspondant a une analyse. `pick` permet de choisir la
// ligne (tests, ou rotation maitrisee) ; par defaut c'est un tirage au sort.
export function renderTrashTalk(standing, pick) {
  const lignes = LIGNES[standing.kind];
  if (!lignes) return null;
  return remplir(tirage(lignes, pick), standing);
}

// Raccourci : classement -> phrase.
export function trashTalkForStanding({ username, rows, period = "total" }, pick) {
  return renderTrashTalk(analyseStanding({ username, rows, period }), pick);
}

// ---------------------------------------------------------------------
// Fin de seance : la pique porte sur la seance qui vient d'etre faite,
// pas sur le classement.
// ---------------------------------------------------------------------

const RECAP_ZERO = [
  "Zero repetition. Tu es venu filmer le sol, c'est ca ?",
  "Rien. Nada. Meme pas une pompe. Sors d'ici, ptit con.",
  "Seance a zero. Le telephone a plus transpire que toi."
];

const RECAP_FAIBLE = [
  "{reps} pompes. Ma grand-mere fait mieux entre deux series de tricot.",
  "{reps} repetitions et tu es deja mort ? Serieusement, chien ?",
  "{reps}. On appelle pas ca une seance, on appelle ca un echauffement rate."
];

const RECAP_CORRECT = [
  "{reps} repetitions. Correct. Correct, c'est tout, ne fais pas le fier.",
  "{reps} pompes au compteur. C'est un debut, lopsa, pas un exploit.",
  "{reps}. Tu as fait le minimum syndical. On note."
];

const RECAP_SOLIDE = [
  "{reps} repetitions. La, tu commences a ressembler a quelque chose.",
  "{reps} pompes. Les autres vont serrer les dents ce soir.",
  "{reps} au compteur. Continue comme ca et ils vont tous pleurer."
];

const RECAP_MONSTRE = [
  "{reps} repetitions. T'es pas humain. Tout le monde ferme sa gueule.",
  "{reps} pompes d'affilee. C'est de la demolition, plus du sport.",
  "{reps}. Le classement vient de prendre une claque, chien."
];

const RECAP_RECORD = [
  "Record explose : {reps} repetitions. Tu viens de tuer ton ancien toi.",
  "Nouveau record a {reps}. Meme toi tu ne t'attendais pas a ca.",
  "{reps} repetitions, record battu. Va le crier sur les toits, tu l'as merite."
];

// reps : repetitions de la seance ; personalBest : meilleure seance
// precedente (null si aucune). Un record prime sur le reste.
export function trashTalkForRecap({ reps, personalBest = null }, pick) {
  const valeur = Math.max(0, Math.round(reps || 0));
  const remplace = (ligne) => ligne.replaceAll("{reps}", String(valeur));

  if (valeur <= 0) return remplace(tirage(RECAP_ZERO, pick));
  if (personalBest !== null && personalBest !== undefined && valeur > personalBest && personalBest > 0) {
    return remplace(tirage(RECAP_RECORD, pick));
  }
  if (valeur < 10) return remplace(tirage(RECAP_FAIBLE, pick));
  if (valeur < 25) return remplace(tirage(RECAP_CORRECT, pick));
  if (valeur < 50) return remplace(tirage(RECAP_SOLIDE, pick));
  return remplace(tirage(RECAP_MONSTRE, pick));
}
