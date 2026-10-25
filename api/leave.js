import { db, handler } from './_db.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const id = String(req.body?.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ugyldig spiller.' });

  const s = db();
  const [st] = await s`select registration_open from squash_settings where id = 1`;
  if (!st.registration_open) return res.status(403).json({ error: 'Påmeldingen er stengt. Be admin om å fjerne deg.' });

  await s`delete from squash_players where id = ${id}::uuid`;
  res.status(200).json({ ok: true });
});
