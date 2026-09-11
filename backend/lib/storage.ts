/**
 * Stockage des médias uploadés (photos de profil, bannières, galerie, chat).
 *
 * Deux backends au choix via STORAGE_DRIVER :
 *  - "r2"    : Cloudflare R2 (S3-compatible) — prod/staging/dev une fois les
 *              credentials renseignées. URLs publiques absolues (R2_PUBLIC_URL).
 *  - "local" (défaut) : disque du serveur, comme avant — fallback dev sans
 *              compte R2, et filet de sécurité si les credentials manquent.
 *
 * Voir étude "Fondations de données" (2026-09-11) : le disque local ne
 * survit pas à une migration/réinstallation du VPS et bloque le scaling
 * horizontal — R2 corrige les deux sans frais d'egress.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import fs from "fs";

export const UPLOADS_DIR = path.resolve(
  __dirname,
  "..",
  ["production", "staging"].includes(process.env.NODE_ENV ?? "") ? "../uploads" : "uploads"
);

type StorageDriver = "r2" | "local";

function getDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === "r2" ? "r2" : "local";
}

/**
 * Un bucket créé avec une jurisdiction restreinte (EU, FedRAMP…) vit sur un
 * endpoint S3 différent du endpoint global — sinon l'API répond "NoSuchBucket"
 * même avec un nom de bucket et des credentials corrects. Réglable via
 * R2_JURISDICTION (ex. "eu") ; tous les buckets Blyss sont en jurisdiction EU
 * (RGPD, voir étude "Fondations de données").
 * https://developers.cloudflare.com/r2/reference/data-location/#jurisdiction-specific-endpoints
 */
export function r2Endpoint(accountId: string): string {
  const jurisdiction = process.env.R2_JURISDICTION?.trim().toLowerCase();
  return jurisdiction
    ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
    : `https://${accountId}.r2.cloudflarestorage.com`;
}

let _s3: S3Client | undefined;

function getS3Client(): S3Client {
  if (_s3) return _s3;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "STORAGE_DRIVER=r2 mais R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY manquent."
    );
  }
  _s3 = new S3Client({
    region: "auto",
    endpoint: r2Endpoint(accountId),
    credentials: { accessKeyId, secretAccessKey },
  });
  return _s3;
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("STORAGE_DRIVER=r2 mais R2_BUCKET_NAME manque.");
  return bucket;
}

function getPublicUrl(): string {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) throw new Error("STORAGE_DRIVER=r2 mais R2_PUBLIC_URL manque.");
  return url.replace(/\/+$/, "");
}

/**
 * Écrit un fichier et renvoie l'URL à stocker en base.
 * `key` = chemin relatif SANS slash de tête, ex. "profile_photo/pp_12_169….webp".
 * Sur R2 → URL absolue (https://...). En local → chemin relatif ("/uploads/...")
 * comme avant, que `resolveMediaUrl` (mobile) et `getImageUrl` (web) savent
 * déjà résoudre — aucun changement front nécessaire des deux côtés.
 */
export async function putFile(key: string, body: Buffer, contentType: string): Promise<string> {
  if (getDriver() === "r2") {
    await getS3Client().send(
      new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType })
    );
    return `${getPublicUrl()}/${key}`;
  }

  const destPath = path.join(UPLOADS_DIR, key);
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await fs.promises.writeFile(destPath, body);
  return `/uploads/${key}`;
}

/**
 * Supprime un fichier référencé par son URL en base (absolue R2 ou relative
 * "/uploads/..."). Best-effort — ne jette jamais (aligné sur le comportement
 * précédent de `fs.unlink(path, () => {})`).
 */
export async function deleteFile(urlOrPath: string): Promise<void> {
  try {
    if (getDriver() === "r2") {
      const publicUrl = getPublicUrl();
      const key = urlOrPath.startsWith(publicUrl)
        ? urlOrPath.slice(publicUrl.length + 1)
        : urlOrPath.replace(/^\/?uploads\//, "");
      await getS3Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
      return;
    }

    const filePath = path.join(UPLOADS_DIR, urlOrPath.replace(/^\/?uploads\//, ""));
    await fs.promises.unlink(filePath);
  } catch {
    // best-effort — la ligne DB associée est déjà supprimée par l'appelant
  }
}
