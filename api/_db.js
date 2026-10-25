import { neon } from '@neondatabase/serverless';

let sql = null;
let ready = null;

export function db() {
  if (!sql) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) {
      const err = new Error('Databasen er ikke koblet til. Åpne Storage i Vercel og koble en Neon-database til prosjektet.');
      err.userCode = 'NO_DB';
      throw err;
    }
    sql = neon(url);
  }
  return sql;
}

// Tabellene opprettes automatisk første gang siden brukes.
export function ensureTables() {
  if (!ready) {
    const s = db();
    ready = (async () => {
      await s`create table if not exists squash_settings (
        id int primary key default 1 check (id = 1),
        registration_open boolean not null default true,
        phase text not null default 'registration'
      )`;
      await s`insert into squash_settings (id) values (1) on conflict (id) do nothing`;
      await s`create table if not exists squash_players (
        id uuid primary key default gen_random_uuid(),
        name text not null check (char_length(trim(name)) between 1 and 30),
        created_at timestamptz not null default now()
      )`;
      await s`create unique index if not exists squash_players_name_unique on squash_players (lower(trim(name)))`;
      await s`alter table squash_settings add column if not exists start_time text`;
      await s`create table if not exists squash_matches (
        id uuid primary key default gen_random_uuid(),
        stage text not null default 'group',
        round int not null,
        court int not null,
        p1 uuid not null references squash_players(id) on delete cascade,
        p2 uuid not null references squash_players(id) on delete cascade,
        score1 int,
        score2 int
      )`;
      await s`alter table squash_settings add column if not exists qualifiers int`;
      await s`alter table squash_matches add column if not exists slot int`;
      await s`alter table squash_matches add column if not exists bracket_pos int`;
      await s`alter table squash_matches add column if not exists kind text not null default 'match'`;
      await s`alter table squash_matches add column if not exists next_id uuid`;
      await s`alter table squash_matches add column if not exists next_side text`;
      await s`alter table squash_matches add column if not exists loser_next_id uuid`;
      await s`alter table squash_matches add column if not exists loser_next_side text`;
      await s`alter table squash_matches alter column p1 drop not null`;
      await s`alter table squash_matches alter column p2 drop not null`;
    })().catch((e) => { ready = null; throw e; });
  }
  return ready;
}

export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

export const DUPLICATE_MSG = 'Det navnet er allerede brukt. Legg til første bokstav i etternavnet.';

// Pakker inn et endepunkt: tabeller, feilhåndtering og ingen mellomlagring.
export function handler(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await ensureTables();
      await fn(req, res);
    } catch (e) {
      console.error(e);
      if (e.userCode === 'NO_DB') return res.status(500).json({ error: e.message, code: 'NO_DB' });
      res.status(500).json({ error: 'Noe gikk galt på serveren. Prøv igjen.' });
    }
  };
}
