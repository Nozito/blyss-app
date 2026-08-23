/**
 * Sémaphore générique pour borner la concurrence sur un travail CPU-bound
 * (bcrypt) sans changer le paramètre de sécurité (cost factor) ni bloquer
 * l'event loop de façon incontrôlée.
 *
 * Preuve du besoin (stress test, 150 VUs concurrents) : au-delà d'une
 * centaine de bcrypt.hash()/compare() simultanés, l'event loop devient si
 * chargé que même des requêtes DB sans rapport (déjà répondues par
 * Postgres en < 1ms côté serveur) dépassent leur propre timeout applicatif
 * faute d'être traitées à temps — un thrashing CPU qui dégrade tout le
 * process, pas seulement l'authentification. Borner la concurrence
 * transforme ce thrashing chaotique en file d'attente prévisible : les
 * requêtes d'auth ralentissent proprement sous forte charge, le reste du
 * trafic (lecture, réservation) reste responsive.
 */
export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  /** État courant, exposé pour l'observabilité (logs/métriques). */
  get stats(): { active: number; queued: number } {
    return { active: this.active, queued: this.queue.length };
  }
}

// UV_THREADPOOL_SIZE=16 en déploiement (documenté dans le README de
// déploiement) — borner à 8 laisse la moitié du threadpool disponible pour
// les autres consommateurs (DNS, fs, autres libs natives) plutôt que de
// laisser bcrypt saturer tout le pool à lui seul.
export const bcryptSemaphore = new Semaphore(Number(process.env.BCRYPT_MAX_CONCURRENCY) || 8);
