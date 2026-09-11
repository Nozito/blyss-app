/**
 * Pousse le contenu de backend/uploads/ (banners, chat, gallery, profile_photo)
 * vers le bucket R2 configuré, en conservant les chemins relatifs comme clés
 * — donc les URLs déjà en base ("/uploads/xxx/yyy.webp") continuent de
 * fonctionner une fois republiées sous R2_PUBLIC_URL/xxx/yyy.webp.
 *
 * Ce script ne touche PAS la base de données : il ne fait que copier les
 * fichiers. Faire pointer les nouvelles URLs vers R2 se fait en deux temps :
 *   1. `npm run migrate:r2`                → copie uploads/ → bucket R2
 *   2. STORAGE_DRIVER=r2 dans le .env visé → les *nouveaux* uploads vont sur R2
 *   3. (optionnel) UPDATE des lignes existantes en base pour réécrire les
 *      chemins "/uploads/..." en URLs R2 absolues — script séparé si besoin,
 *      volontairement pas fait ici pour rester un outil "copie", pas "migration
 *      destructive". Les anciennes URLs relatives continuent de fonctionner
 *      tant que le serveur sert encore /uploads en local (double lecture).
 *
 * Usage :
 *   npx ts-node scripts/migrate-uploads-to-r2.ts            # copie tout
 *   npx ts-node scripts/migrate-uploads-to-r2.ts --dry-run   # liste sans copier
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { r2Endpoint } from "../lib/storage";

const envFile = process.argv.find((a) => a.startsWith("--env="))?.split("=")[1];
dotenv.config({ path: envFile ?? path.resolve(__dirname, "..", "..", ".env.dev") });

const DRY_RUN = process.argv.includes("--dry-run");

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function walk(dir: string, base = dir): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files = files.concat(walk(full, base));
    else files.push(path.relative(base, full));
  }
  return files;
}

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error(
      "Manque R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME.\n" +
      "Remplis-les dans le .env visé, ou passe --env=../.env.staging par exemple."
    );
    process.exit(1);
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    console.error(`Dossier introuvable : ${UPLOADS_DIR}`);
    process.exit(1);
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(accountId),
    credentials: { accessKeyId, secretAccessKey },
  });

  const files = walk(UPLOADS_DIR).filter((f) => !f.startsWith(".")); // ignore .DS_Store etc.
  console.info(`${files.length} fichier(s) trouvé(s) dans ${UPLOADS_DIR}`);
  console.info(`Cible : bucket "${bucket}" (compte ${accountId})${DRY_RUN ? " — DRY RUN, rien n'est copié" : ""}\n`);

  let uploaded = 0;
  let skipped = 0;

  for (const relPath of files) {
    const key = relPath.split(path.sep).join("/"); // Windows-safe → toujours des "/"
    const ext = path.extname(key).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    if (DRY_RUN) {
      console.info(`  [dry-run] ${key}`);
      continue;
    }

    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      skipped++;
      continue; // déjà présent sur R2, on ne réécrase pas
    } catch {
      // n'existe pas encore → on upload
    }

    const body = await fs.promises.readFile(path.join(UPLOADS_DIR, relPath));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    uploaded++;
    console.info(`  ✓ ${key}`);
  }

  if (!DRY_RUN) {
    console.info(`\nTerminé — ${uploaded} fichier(s) uploadé(s), ${skipped} déjà présent(s) sur R2.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
