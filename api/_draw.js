// Trekning av gruppespillet.
// Hver spiller får nøyaktig to kamper, mot to forskjellige motstandere.
// Kampene danner en sirkel (A-B, B-C, C-D ... til siste møter A), og sirkelen
// fordeles på runder slik at:
//  - ingen spiller har to kamper i samme runde
//  - hver runde har maks like mange kamper som det er baner
//  - rundene er jevnt fylt, de fulleste først
//  - ingen står over to runder på rad

export const COURTS = 5;

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Farger kantene i en sirkel med R farger. Nabokanter må ha ulik farge.
function colorCycle(n, R, cap, rng) {
  const colors = new Array(n);
  const count = new Array(R).fill(0);
  let steps = 0;
  function rec(i) {
    if (++steps > 20000) return false;
    if (i === n) return true;
    const options = shuffle([...Array(R).keys()], rng);
    for (const c of options) {
      if (i > 0 && colors[i - 1] === c) continue;
      if (i === n - 1 && colors[0] === c) continue;
      if (count[c] >= cap) continue;
      colors[i] = c;
      count[c]++;
      if (rec(i + 1)) return true;
      count[c]--;
    }
    return false;
  }
  return rec(0) ? colors : null;
}

// Antall spillere som står over to runder på rad (0 er best).
function consecutiveSitOuts(rounds, ids) {
  const plays = new Map(ids.map((id) => [id, rounds.map(() => false)]));
  rounds.forEach((r, i) => r.forEach(([a, b]) => { plays.get(a)[i] = true; plays.get(b)[i] = true; }));
  let bad = 0;
  for (const flags of plays.values()) {
    for (let i = 0; i + 1 < flags.length; i++) if (!flags[i] && !flags[i + 1]) { bad++; break; }
  }
  return bad;
}

// Returnerer en liste med runder. Hver runde er en liste med { court, p1, p2 }.
// Med 3 runder eller færre går "ingen står over to på rad" alltid opp. Med flere
// runder er det ikke mulig for alle, og da velges den trekningen med færrest.
export function drawGroupStage(ids, courts = COURTS, rng = Math.random) {
  const n = ids.length;
  if (n < 4) throw new Error('Trenger minst 4 spillere.');
  const minRounds = Math.max(2, Math.ceil(n / courts));

  for (let R = minRounds; R <= minRounds + 3; R++) {
    const cap = Math.min(courts, Math.ceil(n / R));
    let best = null, bestBad = Infinity;
    for (let attempt = 0; attempt < 400; attempt++) {
      const order = shuffle(ids.slice(), rng);
      const colors = colorCycle(n, R, cap, rng);
      if (!colors) break; // ingen løsning med så mange runder
      const rounds = Array.from({ length: R }, () => []);
      order.forEach((p, i) => rounds[colors[i]].push([p, order[(i + 1) % n]]));
      if (rounds.some((r) => r.length === 0)) continue;
      const sizes = rounds.map((r) => r.length);
      if (Math.max(...sizes) - Math.min(...sizes) > 1) continue; // jevnt fylte runder
      rounds.sort((a, b) => b.length - a.length); // fulleste runder først
      const bad = consecutiveSitOuts(rounds, ids);
      if (bad < bestBad) { best = rounds; bestBad = bad; }
      if (bad === 0) break;
    }
    if (best) {
      return best.map((r) =>
        shuffle(r.slice(), rng).map(([a, b], i) => (rng() < 0.5 ? { court: i + 1, p1: a, p2: b } : { court: i + 1, p1: b, p2: a }))
      );
    }
  }
  throw new Error('Fant ikke et gyldig kampoppsett. Prøv igjen.');
}
