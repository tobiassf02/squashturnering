// Regler for resultater og tabell.

// Første til 11, og man må vinne med 2 poeng.
// Gyldige eksempler: 11-0 til 11-9, 12-10, 13-11, 14-12 ...
export function validScore(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) return false;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi === lo) return false;
  if (hi === 11) return lo <= 9;
  return hi > 11 && hi - lo === 2;
}

export const SCORE_MSG = 'Resultatet stemmer ikke med reglene. Første til 11, og man må vinne med 2 poeng. Eksempler: 11–9, 11–0 eller 13–11.';

// Tabell etter gruppespillet: seier gir 2 poeng, deretter poengdifferanse,
// deretter flest scorede poeng, og til slutt alfabetisk.
export function standings(players, matches) {
  const t = new Map(players.map((p) => [p.id, { id: p.id, name: p.name, k: 0, w: 0, pf: 0, pa: 0 }]));
  for (const m of matches) {
    if (m.stage !== 'group' || m.score1 == null || m.score2 == null) continue;
    const a = t.get(m.p1);
    const b = t.get(m.p2);
    if (!a || !b) continue;
    a.k++; b.k++;
    a.pf += m.score1; a.pa += m.score2;
    b.pf += m.score2; b.pa += m.score1;
    (m.score1 > m.score2 ? a : b).w++;
  }
  return [...t.values()]
    .map((x) => ({ ...x, diff: x.pf - x.pa, pts: x.w * 2 }))
    .sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.pf - x.pf || x.name.localeCompare(y.name, 'nb'))
    .map((x, i) => ({ ...x, rank: i + 1 }));
}
