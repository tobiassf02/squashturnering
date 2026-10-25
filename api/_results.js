// Lagring av resultater og videreføring av vinnere i sluttspillet.

async function place(s, id, side, playerId) {
  if (!id) return;
  if (side === 'p1') await s`update squash_matches set p1 = ${playerId}::uuid where id = ${id}::uuid`;
  else await s`update squash_matches set p2 = ${playerId}::uuid where id = ${id}::uuid`;
}

// Er en av kampene som vinneren/taperen skal videre til allerede spilt?
export async function downstreamPlayed(s, m) {
  const ids = [m.next_id, m.loser_next_id].filter(Boolean);
  for (const id of ids) {
    const [row] = await s`select score1 from squash_matches where id = ${id}::uuid`;
    if (row && row.score1 != null) return true;
  }
  return false;
}

// Setter fasen til 'done' når alle sluttspillkamper er spilt, ellers 'knockout'.
async function syncPhase(s) {
  const [{ total, open }] = await s`select count(*)::int as total, count(*) filter (where score1 is null)::int as open from squash_matches where stage = 'ko'`;
  if (total === 0) return;
  await s`update squash_settings set phase = ${open === 0 ? 'done' : 'knockout'} where id = 1`;
}

export async function saveResult(s, m, a, b) {
  await s`update squash_matches set score1 = ${a}, score2 = ${b} where id = ${m.id}::uuid`;
  if (m.stage === 'ko') {
    const winner = a > b ? m.p1 : m.p2;
    const loser = a > b ? m.p2 : m.p1;
    await place(s, m.next_id, m.next_side, winner);
    await place(s, m.loser_next_id, m.loser_next_side, loser);
    await syncPhase(s);
  }
}

export async function clearResult(s, m) {
  await s`update squash_matches set score1 = null, score2 = null where id = ${m.id}::uuid`;
  if (m.stage === 'ko') {
    await place(s, m.next_id, m.next_side, null);
    await place(s, m.loser_next_id, m.loser_next_side, null);
    await syncPhase(s);
  }
}
