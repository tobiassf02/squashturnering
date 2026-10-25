import { db, handler, cleanName, DUPLICATE_MSG } from './_db.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'Skriv inn navnet ditt.' });

  const s = db();
  const [st] = await s`select registration_open from squash_settings where id = 1`;
  if (!st.registration_open) return res.status(403).json({ error: 'Påmeldingen er stengt.' });

  try {
    const [player] = await s`insert into squash_players (name) values (${name}) returning id, name, created_at`;
    res.status(201).json({ player });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: DUPLICATE_MSG });
    throw e;
  }
});
