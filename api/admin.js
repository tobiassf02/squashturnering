import { db, handler, cleanName, DUPLICATE_MSG } from './_db.js';
import { drawGroupStage, COURTS } from './_draw.js';
import { validScore, SCORE_MSG, standings } from './_rules.js';
import { buildKnockout } from './_bracket.js';
import { saveResult, clearResult, downstreamPlayed } from './_results.js';

const UUID = /^[0-9a-f-]{36}$/i;

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

    case 'set_result':
    case 'clear_result': {
      const id = String(req.body.match_id ?? '');
      if (!UUID.test(id)) return res.status(400).json({ error: 'Ugyldig kamp.' });
      const [m] = await s`select * from squash_matches where id = ${id}::uuid`;
      if (!m) return res.status(404).json({ error: 'Fant ikke kampen.' });
      if (m.stage === 'group' && phase !== 'groups') {
        return res.status(400).json({ error: 'Sluttspillet er satt opp, så gruppekampene er låst. Bruk «Tilbake til gruppespillet» først hvis du må endre.' });
      }
      if (m.stage === 'ko' && phase !== 'knockout' && phase !== 'done') return res.status(400).json({ error: 'Sluttspillet er ikke i gang.' });
      if (m.stage === 'ko' && await downstreamPlayed(s, m)) {
        return res.status(409).json({ error: 'Neste kamp er allerede spilt. Fjern det resultatet først.' });
      }
      if (action === 'clear_result') {
        await clearResult(s, m);
        return res.status(200).json({ ok: true });
      }
      const a = Number(req.body.score1);
      const b = Number(req.body.score2);
      if (!validScore(a, b)) return res.status(400).json({ error: SCORE_MSG });
      if (!m.p1 || !m.p2) return res.status(400).json({ error: 'Motstanderne i denne kampen er ikke klare ennå.' });
      await saveResult(s, m, a, b);
      return res.status(200).json({ ok: true });
    }

    case 'start_knockout': {
      if (phase !== 'groups') return res.status(400).json({ error: 'Gruppespillet er ikke i gang.' });
      const [{ open }] = await s`select count(*)::int as open from squash_matches where stage = 'group' and score1 is null`;
      if (open > 0) return res.status(400).json({ error: `Det mangler resultat i ${open} ${open === 1 ? 'gruppekamp' : 'gruppekamper'}.` });
      const players = await s`select id, name from squash_players`;
      const matches = await s`select stage, p1, p2, score1, score2 from squash_matches where stage = 'group'`;
      const table = standings(players, matches);
      const q = Number(req.body.qualifiers);
      if (!Number.isInteger(q) || q < 4 || q > table.length) {
        return res.status(400).json({ error: `Antall videre må være et tall fra 4 til ${table.length}.` });
      }
      const { rows } = buildKnockout(table.slice(0, q).map((x) => x.id), COURTS);
      try {
        for (const r of rows) {
          await s`insert into squash_matches (id, stage, kind, round, bracket_pos, court, slot, p1, p2, next_id, next_side, loser_next_id, loser_next_side)
                  values (${r.id}::uuid, 'ko', ${r.kind}, ${r.round}, ${r.bracket_pos}, ${r.court}, ${r.slot}, ${r.p1}::uuid, ${r.p2}::uuid,
                          ${r.next_id}::uuid, ${r.next_side}, ${r.loser_next_id}::uuid, ${r.loser_next_side})`;
        }
      } catch (e) {
        await s`delete from squash_matches where stage = 'ko'`;
        throw e;
      }
      await s`update squash_settings set phase = 'knockout', qualifiers = ${q} where id = 1`;
      return res.status(200).json({ ok: true });
    }

    case 'undo_knockout': {
      if (phase !== 'knockout') return res.status(400).json({ error: 'Sluttspillet er ikke i gang, eller det er allerede ferdig.' });
      const [{ played }] = await s`select count(*)::int as played from squash_matches where stage = 'ko' and score1 is not null`;
      if (played > 0) return res.status(400).json({ error: 'Det er allerede spilt kamper i sluttspillet. Fjern de resultatene først.' });
      await s`delete from squash_matches where stage = 'ko'`;
      await s`update squash_settings set phase = 'groups', qualifiers = null where id = 1`;
      return res.status(200).json({ ok: true });
    }

    case 'reset':
      await s`delete from squash_matches`;
      await s`delete from squash_players`;
      await s`update squash_settings set registration_open = true, phase = 'registration', start_time = null, qualifiers = null where id = 1`;
      return res.status(200).json({ ok: true });

    default:
      return res.status(400).json({ error: 'Ukjent handling.' });
  }
});
