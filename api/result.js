import { db, handler } from './_db.js';
import { validScore, SCORE_MSG } from './_rules.js';
import { saveResult, downstreamPlayed } from './_results.js';

const UUID = /^[0-9a-f-]{36}$/i;

// Spillerne i en kamp legger selv inn resultatet.
export default handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const { match_id, player_id } = req.body ?? {};
  const a = Number(req.body?.score1);
  const b = Number(req.body?.score2);
  if (!UUID.test(String(match_id ?? '')) || !UUID.test(String(player_id ?? ''))) {
    return res.status(400).json({ error: 'Velg hvem du er først.' });
  }
  if (!validScore(a, b)) return res.status(400).json({ error: SCORE_MSG });

  const s = db();
  const [m] = await s`select * from squash_matches where id = ${match_id}::uuid`;
  if (!m) return res.status(404).json({ error: 'Fant ikke kampen.' });
  const [{ phase }] = await s`select phase from squash_settings where id = 1`;

  if (m.stage === 'group' && phase !== 'groups') {
    return res.status(400).json({ error: 'Gruppespillet er ferdig, så resultatene er låst. Be admin om hjelp.' });
  }
  if (m.stage === 'ko' && phase !== 'knockout') {
    return res.status(400).json({ error: phase === 'done' ? 'Turneringen er ferdig, så resultatene er låst. Be admin om hjelp.' : 'Sluttspillet er ikke i gang.' });
  }
  if (!m.p1 || !m.p2) return res.status(400).json({ error: 'Motstanderne i denne kampen er ikke klare ennå.' });
  if (player_id !== m.p1 && player_id !== m.p2) {
    return res.status(403).json({ error: 'Bare spillerne i kampen kan legge inn resultatet. Be en av dem eller admin.' });
  }
  if (m.stage === 'ko' && await downstreamPlayed(s, m)) {
    return res.status(409).json({ error: 'Neste kamp er allerede spilt, så dette resultatet er låst. Be admin om hjelp.' });
  }

  await saveResult(s, m, a, b);
  res.status(200).json({ ok: true });
});
