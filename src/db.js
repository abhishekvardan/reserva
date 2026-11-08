import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
let impl = null;

/** Postgres via `pg` when DATABASE_URL is set (TLS verified; DATABASE_CA_CERT for private CAs), else PGlite on disk. */
export async function initDb() {
  if (impl) return impl;
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import("pg");
    const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.VERCEL ? 3 : 10,
      ...(ca ? { ssl: { ca, rejectUnauthorized: true } } : {}),
    });
    impl = {
      kind: "postgres",
      query: (t, p) => pool.query(t, p),
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          const out = await fn({ query: (t, p) => c.query(t, p) });
          await c.query("COMMIT");
          return out;
        } catch (e) {
          await c.query("ROLLBACK").catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.PGLITE_DIR || (process.env.VERCEL ? "/tmp/pglite" : path.resolve(here, "../.data/pglite"));
    if (dir !== "memory") fs.mkdirSync(dir, { recursive: true });
    const pg = dir === "memory" ? new PGlite() : new PGlite(dir);
    await pg.waitReady;
    impl = {
      kind: dir === "memory" ? "pglite (memory)" : "pglite",
      query: (t, p) => pg.query(t, p),
      tx: (fn) => pg.transaction((t) => fn({ query: (q, p) => t.query(q, p) })),
      close: () => pg.close(),
    };
  }
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await impl.query(stmt);
  return impl;
}

export const db = {
  query: (t, p = []) => impl.query(t, p),
  one: async (t, p = []) => (await impl.query(t, p)).rows[0] ?? null,
  many: async (t, p = []) => (await impl.query(t, p)).rows,
  tx: (fn) => impl.tx(fn),
  get kind() {
    return impl?.kind;
  },
  close: () => impl?.close(),
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  cuisine text NOT NULL,
  neighborhood text NOT NULL,
  price_level integer NOT NULL,
  rating real NOT NULL,
  review_count integer NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL,
  hue integer NOT NULL,
  opens text NOT NULL,
  closes text NOT NULL,
  tables jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  price_cents integer NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  date date NOT NULL,
  time text NOT NULL,
  minutes integer NOT NULL,
  party_size integer NOT NULL,
  table_size integer NOT NULL,
  special_requests text,
  status text NOT NULL DEFAULT 'confirmed',
  placed_by text NOT NULL DEFAULT 'guest',
  agent_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_slot_idx ON bookings (restaurant_id, date, status);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, date)
`;
