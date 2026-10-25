// Bygger sluttspillet (utslagsturnering) ut fra tabellen.
// Plassering 1 mot lavest, 2 mot nest lavest osv. Er antallet ikke 4, 8, 16 ...
// får de best plasserte spillerne bye (går direkte videre til neste runde).
// Finale og bronsefinale spilles samtidig.

import { randomUUID } from 'node:crypto';
import { COURTS } from './_draw.js';

// Standard rekkefølge: 1 16 8 9 4 13 5 12 2 15 7 10 3 14 6 11 (for 16)
export function seedOrder(B) {
  let order = [1];
  while (order.length < B) {
    const m = order.length * 2 + 1;
    order = order.flatMap((s) => [s, m - s]);
  }
  return order;
}

// seedIds: spiller-id-er i plasseringsrekkefølge (indeks 0 = nr. 1).
// Returnerer { rows, slots } der rows er klare til å lagres som kamper.
export function buildKnockout(seedIds, courts = COURTS) {
  const Q = seedIds.length;
  if (Q < 4) throw new Error('Sluttspillet trenger minst 4 spillere.');
  let B = 1;
  while (B < Q) B *= 2;
  const K = Math.log2(B);
  const order = seedOrder(B);

  // Første runde
  let level = [];
  for (let i = 0; i < B / 2; i++) {
    const a = seedIds[order[2 * i] - 1] ?? null;
    const b = seedIds[order[2 * i + 1] - 1] ?? null;
    const bye = !a || !b;
    level.push({ round: 1, pos: i, p1: a, p2: b, bye, advancer: bye ? (a || b) : null, id: bye ? null : randomUUID() });
  }
  const byRound = [level];

  // Neste runder
  for (let r = 2; r <= K; r++) {
    const next = [];
    for (let j = 0; j < level.length / 2; j++) {
      const node = { round: r, pos: j, p1: null, p2: null, bye: false, id: randomUUID() };
      [level[2 * j], level[2 * j + 1]].forEach((child, idx) => {
        const side = idx === 0 ? 'p1' : 'p2';
        if (child.bye) node[side] = child.advancer;
        else { child.next_id = node.id; child.next_side = side; }
      });
      next.push(node);
    }
    byRound.push(next);
    level = next;
  }

  // Bronsefinale: taperne fra semifinalene
  const final = byRound[K - 1][0];
  const bronze = { round: K, pos: 1, kind: 'bronze', p1: null, p2: null, id: randomUUID() };
  const semis = K >= 2 ? byRound[K - 2] : [];
  semis.forEach((semi, idx) => { semi.loser_next_id = bronze.id; semi.loser_next_side = idx === 0 ? 'p1' : 'p2'; });

  // Baner og tidsluker: runde for runde
  const rows = [];
  let slotBase = 0;
  for (let r = 1; r <= K; r++) {
    const list = byRound[r - 1].filter((n) => !n.bye);
    if (r === K) list.push(bronze);
    list.forEach((n, i) => {
      rows.push({
        id: n.id, stage: 'ko', round: r, bracket_pos: n.pos, kind: n.kind || 'match',
        court: (i % courts) + 1, slot: slotBase + Math.floor(i / courts),
        p1: n.p1, p2: n.p2,
        next_id: n.next_id ?? null, next_side: n.next_side ?? null,
        loser_next_id: n.loser_next_id ?? null, loser_next_side: n.loser_next_side ?? null
      });
    });
    slotBase += Math.ceil(list.length / courts);
  }
  void final;
  return { rows, slots: slotBase, rounds: K };
}
