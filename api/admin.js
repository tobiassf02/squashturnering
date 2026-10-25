import { db, handler, cleanName, DUPLICATE_MSG } from './_db.js';

export default handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });

  const expected = process.env.ADMIN_PIN;
  if (!expected) return res.status(500).json({ error: 'ADMIN_PIN er ikke satt i Vercel (Settings, Environment Variables).' });

  const { pin, action } = req.body ?? {};
  if (String(pin ?? '') !== expected) {
    await new Promise((r) => setTimeout(r, 600)); // bremser gjetting
    return res.status(401).json({ error: 'Feil PIN.' });
  }

  const s = db();
  switch (action) {
    case 'check':
      return res.status(200).json({ ok: true });

    case 'set_registration':
      await s`update squash_settings set registration_open = ${!!req.body.open} where id = 1`;
      return res.status(200).json({ ok: true });

    case 'add_player': {
      const name = cleanName(req.body.name);
      if (!name) return res.status(400).json({ error: 'Skriv inn et navn.' });
      try {
        const [player] = await s`insert into squash_players (name) values (${name}) returning id, name, created_at`;
        return res.status(201).json({ player });
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: DUPLICATE_MSG });
        throw e;
      }
    }

    case 'remove_player': {
      const id = String(req.body.id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ugyldig spiller.' });
      await s`delete from squash_players where id = ${id}::uuid`;
      return res.status(200).json({ ok: true });
    }

    case 'reset':
      await s`delete from squash_players`;
      await s`update squash_settings set registration_open = true, phase = 'registration' where id = 1`;
      return res.status(200).json({ ok: true });

    default:
      return res.status(400).json({ error: 'Ukjent handling.' });
  }
});
