import { db, handler } from './_db.js';

const UUID = /^[0-9a-f-]{36}$/i;

// Én stemme per spiller. candidate_id = null fjerner stemmen.
export default handler(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const { voter_id, candidate_id } = req.body ?? {};
  if (!UUID.test(String(voter_id ?? ''))) return res.status(400).json({ error: 'Velg hvem du er først.' });

  const s = db();
  const [st] = await s`select outfit_revealed from squash_settings where id = 1`;
  if (st.outfit_revealed) return res.status(403).json({ error: 'Avstemmingen er avsluttet.' });
  const [voter] = await s`select id from squash_players where id = ${voter_id}::uuid`;
  if (!voter) return res.status(404).json({ error: 'Fant ikke deg i spillerlisten. Velg hvem du er på nytt.' });

  if (candidate_id == null) {
    await s`delete from squash_votes where voter = ${voter_id}::uuid`;
    return res.status(200).json({ ok: true });
  }
  if (!UUID.test(String(candidate_id))) return res.status(400).json({ error: 'Ugyldig valg.' });
  if (candidate_id === voter_id) return res.status(400).json({ error: 'Du kan ikke stemme på deg selv.' });
  const [cand] = await s`select id from squash_players where id = ${candidate_id}::uuid`;
  if (!cand) return res.status(404).json({ error: 'Fant ikke spilleren.' });

  await s`insert into squash_votes (voter, candidate) values (${voter_id}::uuid, ${candidate_id}::uuid)
          on conflict (voter) do update set candidate = excluded.candidate`;
  res.status(200).json({ ok: true });
});
