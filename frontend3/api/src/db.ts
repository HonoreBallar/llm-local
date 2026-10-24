import pg from 'pg';

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || 'postgres://categories:categories@localhost:5433/categories',
});

// Schéma créé au démarrage (idempotent) : pas d'outil de migration pour une seule table.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  nom         VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Unicité insensible à la casse : « Livres » et « livres » sont la même catégorie.
CREATE UNIQUE INDEX IF NOT EXISTS categories_nom_unique ON categories (lower(nom));

-- Fiches CNI et KYC : les champs propres à chaque type sont dans donnees (voir fiches/schema.ts).
CREATE TABLE IF NOT EXISTS fiches (
  id          SERIAL PRIMARY KEY,
  type        VARCHAR(10) NOT NULL CHECK (type IN ('cni', 'kyc')),
  donnees     JSONB NOT NULL DEFAULT '{}',
  "analyse"   JSONB,             -- ANALYSE est un mot réservé de PostgreSQL : toujours entre guillemets
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiches_type ON fiches (type);

-- Fichiers joints : stockés sur disque (volume Docker), seul le nom généré est en base.
CREATE TABLE IF NOT EXISTS fiche_documents (
  id          SERIAL PRIMARY KEY,
  fiche_id    INTEGER NOT NULL REFERENCES fiches(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL,
  nom_fichier VARCHAR(255) NOT NULL,
  mime        VARCHAR(100) NOT NULL,
  taille      INTEGER NOT NULL,
  stockage    VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiche_documents_fiche ON fiche_documents (fiche_id);
`;

export async function migrate(retries = 10): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await pool.query(SCHEMA);
      return;
    } catch (err) {
      if (i >= retries) throw err;
      console.warn(`Base indisponible (essai ${i}/${retries}) : ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
