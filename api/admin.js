import { db, handler, cleanName, DUPLICATE_MSG } from './_db.js';
import { drawGroupStage, COURTS } from './_draw.js';

const LOCKED = 'Turneringen er i gang. Nullstill først hvis du vil endre spillerne.';

async function createGroupMatches(s) {
  const players = await s`select id from squash_players order by created_at`;
  const rounds = drawGroupStage(players.map((p) => p.id), COURTS);
  try {
    for (let r = 0; r < rounds.length; r++) {
      for (const m of rounds[r]) {
        await s`insert into squash_matches (stage, round, court, p1, p2)
                values ('group', ${r + 1}, ${m.court}, ${m.p1}::uuid, ${m.p2}::uuid)`;
      }
    }
  } catch (e) {
    await s`delete from squash_matches`; // aldri la et halvt oppsett bli liggende
    throw e;
  }
}

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
  const [{ phase }] = await s`select phase from squash_settings where id = 1`;

  switch (action) {
    case 'check':
      return res.status(200).json({ ok: true });

    case 'set_registration':
      if (phase !== 'registration') return res.status(400).json({ error: LOCKED });
      await s`update squash_settings set registration_open = ${!!req.body.open} where id = 1`;
      return res.status(200).json({ ok: true });

    case 'add_player': {
      if (phase !== 'registration') return res.status(400).json({ error: LOCKED });
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
      if (phase !== 'registration') return res.status(400).json({ error: LOCKED });
      const id = String(req.body.id ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Ugyldig spiller.' });
      await s`delete from squash_players where id = ${id}::uuid`;
      return res.status(200).json({ ok: true });
    }

    case 'start_tournament': {
      if (phase !== 'registration') return res.status(400).json({ error: 'Turneringen er allerede startet.' });
      const [{ n }] = await s`select count(*)::int as n from squash_players`;
      if (n < 4) return res.status(400).json({ error: 'Det må være minst 4 spillere for å starte.' });
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body.start_time ?? '')) ? req.body.start_time : '18:00';
      await s`delete from squash_matches`;
      await createGroupMatches(s);
      await s`update squash_settings set phase = 'groups', registration_open = false, start_time = ${time} where id = 1`;
      return res.status(200).json({ ok: true });
    }

    case 'reshuffle': {
      if (phase !== 'groups') return res.status(400).json({ error: 'Turneringen er ikke i gruppespillet.' });
      const [{ played }] = await s`select count(*)::int as played from squash_matches where score1 is not null`;
      if (played > 0) return res.status(400).json({ error: 'Det er allerede lagt inn resultater, så kampene kan ikke trekkes på nytt.' });
      await s`delete from squash_matches`;
      await createGroupMatches(s);
      return res.status(200).json({ ok: true });
    }

    case 'reset':
      await s`delete from squash_matches`;
      await s`delete from squash_players`;
      await s`update squash_settings set registration_open = true, phase = 'registration', start_time = null where id = 1`;
      return res.status(200).json({ ok: true });

    default:
      return res.status(400).json({ error: 'Ukjent handling.' });
  }
});
