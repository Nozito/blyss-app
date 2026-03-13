#!/usr/bin/env node
/**
 * scripts/db.mjs — Gestionnaire de base de données Blyss
 *
 * Utilise l'API Management Supabase pour appliquer migrations et seed
 * sans dépendre d'une connexion pg directe (compatible IPv4).
 *
 * Usage :
 *   node scripts/db.mjs status          — état des migrations
 *   node scripts/db.mjs push            — applique les migrations en attente
 *   node scripts/db.mjs seed            — injecte les données de dev (seed.sql)
 *   node scripts/db.mjs reset           — remet à zéro et ré-applique tout
 *   node scripts/db.mjs new <nom>       — crée un fichier de migration
 */

import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const SEED_FILE = join(ROOT, "supabase", "seed.sql");

// ── Supabase project ref ─────────────────────────────────────────────────────
const CONFIG_FILE = join(ROOT, "supabase", "config.toml");
function getProjectRef() {
  if (existsSync(CONFIG_FILE)) {
    const m = readFileSync(CONFIG_FILE, "utf8").match(/project_id\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error(
    'project_id introuvable dans supabase/config.toml.\n' +
    'Ajoutez : project_id = "votre-ref"'
  );
}

// ── Management API token ──────────────────────────────────────────────────────
function getToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    const raw = execSync(
      'security find-generic-password -s "Supabase CLI" -w 2>/dev/null',
      { stdio: ["pipe", "pipe", "pipe"] }
    ).toString().trim();
    if (raw.startsWith("go-keyring-base64:")) {
      return Buffer.from(raw.replace("go-keyring-base64:", ""), "base64").toString();
    }
    return raw;
  } catch {
    // Not on macOS or keychain not set up
  }
  throw new Error(
    "Token Supabase introuvable.\n" +
    "  Option 1 : définir SUPABASE_ACCESS_TOKEN dans .env.dev\n" +
    "  Option 2 : supabase login (enregistre dans le keychain)"
  );
}

// ── Management API query ──────────────────────────────────────────────────────
async function sql(query) {
  const ref = getProjectRef();
  const token = getToken();
  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  const json = await resp.json();
  if (!resp.ok || json.message) {
    throw new Error(`SQL error: ${JSON.stringify(json)}`);
  }
  return json;
}

// ── Migration tracking table ──────────────────────────────────────────────────
async function ensureMigrationsTable() {
  await sql(`
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;
    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
      version TEXT NOT NULL PRIMARY KEY,
      name    TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations() {
  try {
    const rows = await sql(
      "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"
    );
    return new Set(rows.map((r) => r.version));
  } catch {
    return new Set();
  }
}

async function markApplied(version, name) {
  await sql(
    `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('${version}', '${name}')
     ON CONFLICT (version) DO NOTHING;`
  );
}

// ── Migration files ───────────────────────────────────────────────────────────
function getMigrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => {
      const version = f.replace(/\.sql$/, "").split("_")[0];
      return { file: f, version, path: join(MIGRATIONS_DIR, f) };
    });
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdStatus() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();

  console.log("\n  Migration                              | Statut");
  console.log("  ─────────────────────────────────────────────────────");
  for (const { file, version } of files) {
    const status = applied.has(version) ? "✅ appliquée" : "⏳ en attente";
    console.log(`  ${file.padEnd(40)}| ${status}`);
  }
  const pending = files.filter((f) => !applied.has(f.version));
  console.log(`\n  ${files.length} migration(s) — ${pending.length} en attente\n`);
}

async function cmdPush() {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();
  const files = getMigrationFiles();
  const pending = files.filter((f) => !applied.has(f.version));

  if (pending.length === 0) {
    console.log("✅ Base de données à jour, aucune migration en attente.");
    return;
  }

  for (const { file, version, path } of pending) {
    console.log(`▶ Application de ${file}...`);
    const content = readFileSync(path, "utf8");
    await sql(content);
    await markApplied(version, file.replace(/\.sql$/, ""));
    console.log(`  ✅ ${file} appliquée`);
  }
  console.log(`\n✅ ${pending.length} migration(s) appliquée(s).`);
}

async function cmdSeed() {
  if (!existsSync(SEED_FILE)) {
    console.error("❌ supabase/seed.sql introuvable.");
    process.exit(1);
  }
  console.log("▶ Application du seed...");
  const content = readFileSync(SEED_FILE, "utf8");
  await sql(content);
  console.log("✅ Seed appliqué avec succès.");
}

async function cmdReset() {
  console.log("⚠️  Reset : suppression de toutes les tables publiques...");
  // Drop all tables in public schema in the right order
  await sql(`
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
    DROP TABLE IF EXISTS supabase_migrations.schema_migrations CASCADE;
  `);
  console.log("✅ Tables supprimées.");
  await cmdPush();
  await cmdSeed();
}

async function cmdNew(name) {
  if (!name) {
    console.error("Usage : node scripts/db.mjs new <nom_de_migration>");
    process.exit(1);
  }
  const ts = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .substring(0, 14);
  const slug = name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const filename = `${ts}_${slug}.sql`;
  const filepath = join(MIGRATIONS_DIR, filename);
  writeFileSync(
    filepath,
    `-- Migration : ${slug}\n-- Date : ${new Date().toISOString()}\n\n`
  );
  console.log(`✅ Migration créée : supabase/migrations/${filename}`);
}

// ── Entry point ───────────────────────────────────────────────────────────────
const [, , cmd, ...args] = process.argv;

const commands = {
  status: cmdStatus,
  push: cmdPush,
  seed: cmdSeed,
  reset: cmdReset,
  new: () => cmdNew(args[0]),
};

if (!cmd || !commands[cmd]) {
  console.log(
    "Usage : node scripts/db.mjs <status|push|seed|reset|new <nom>>"
  );
  process.exit(cmd ? 1 : 0);
}

commands[cmd]().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
