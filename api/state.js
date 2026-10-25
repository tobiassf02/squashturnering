import { db, handler } from './_db.js';
import { standings } from './_rules.js';

export default handler(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metoden er ikke tillatt.' });
  const s = db();
  const me = String(req.query?.me ?? new URL(req.url, 'http://x').searchParams.get('me') ?? '');
  const [players, settings, matches, votes] = await Promise.all([
    s`select id, name, created_at from squash_players order by created_at, name`,
    s`select registration_open, phase, start_time, qualifiers, outfit_revealed from squash_settings where id = 1`,
    s`select id, stage, kind, round, bracket_pos, court, slot, p1, p2, score1, score2, next_id, next_side, loser_next_id, loser_next_side
      from squash_matches order by stage, round, bracket_pos nulls last, court`,
    s`select voter, candidate from squash_votes`
  ]);
  const revealed = !!settings[0].outfit_revealed;
  const { outfit_revealed, ...pub } = settings[0];
  const outfit = {
    revealed,
    voters: votes.map((v) => v.voter), // hvem som har stemt, ikke på hvem
    my_vote: votes.find((v) => v.voter === me)?.candidate ?? null,
    tally: revealed
      ? players.map((p) => ({ id: p.id, votes: votes.filter((v) => v.candidate === p.id).length })).sort((a, b) => b.votes - a.votes)
      : null
  };
  res.status(200).json({ players, settings: pub, matches, standings: standings(players, matches), outfit });
});
