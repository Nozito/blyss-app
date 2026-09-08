import path from "path";

/**
 * Joint des segments à un répertoire de base et garantit que le chemin résolu
 * reste bien à l'intérieur de ce répertoire (défense contre un `..` ou un
 * chemin absolu qui s'échapperait — path traversal).
 *
 * Utilisé par les scripts de migration/cleanup pour écrire leurs snapshots :
 * les segments actuels ne sont pas contrôlés par un utilisateur, mais un futur
 * appelant pourrait passer `snapshotDir` ou un nom de fichier dynamique.
 *
 * @throws si le chemin résolu sort de `baseDir`.
 */
export function safeJoin(baseDir: string, ...segments: string[]): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...segments);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new Error(`Chemin hors du répertoire autorisé : ${target} (base ${base})`);
  }
  return target;
}
