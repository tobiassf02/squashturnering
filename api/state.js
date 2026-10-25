import { db, handler } from './_db.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const s = db();
  const [players, settings] = await Promise.all([
    s`select id, name, created_at from squash_players order by created_at, name`,
    s`select registration_open, phase from squash_settings where id = 1`
  ]);
  res.status(200).json({ players, settings: settings[0] });
});
