import { db, handler } from './_db.js';
import { standings } from './_rules.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const s = db();
  const [players, settings, matches] = await Promise.all([
    s`select id, name, created_at from squash_players order by created_at, name`,
    s`select registration_open, phase, start_time, qualifiers from squash_settings where id = 1`,
    s`select id, stage, kind, round, bracket_pos, court, slot, p1, p2, score1, score2, next_id, next_side, loser_next_id, loser_next_side
      from squash_matches order by stage, round, bracket_pos nulls last, court`
  ]);
  res.status(200).json({ players, settings: settings[0], matches, standings: standings(players, matches) });
});
