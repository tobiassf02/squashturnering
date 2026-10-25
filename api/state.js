import { db, handler } from './_db.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const s = db();
  const [players, settings, matches] = await Promise.all([
    s`select id, name, created_at from squash_players order by created_at, name`,
    s`select registration_open, phase, start_time from squash_settings where id = 1`,
    s`select id, stage, round, court, p1, p2, score1, score2 from squash_matches order by stage, round, court`
  ]);
  res.status(200).json({ players, settings: settings[0], matches });
});
