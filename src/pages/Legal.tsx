import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

const Legal = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = location.hash;
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 150);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.hash]);

  const sectionClass = "scroll-mt-32 space-y-6";
  const h2Class = "font-display text-2xl font-bold text-foreground border-b border-border pb-3";
  const h3Class = "font-semibold text-foreground mb-2";
  const bodyClass = "space-y-5 text-sm text-muted-foreground leading-relaxed";

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header sticky ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-xl hover:bg-muted/50 transition-all active:scale-90"
            aria-label="Retour"
          >
            <ChevronLeft size={22} className="text-foreground" aria-hidden="true" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">Informations légales</h1>
        </div>
        {/* Sommaire */}
        <nav className="max-w-2xl mx-auto px-6 pb-3 flex gap-5 text-xs overflow-x-auto" aria-label="Sommaire">
          <a href="#mentions-legales" className="text-primary underline-offset-2 hover:underline whitespace-nowrap transition-colors">
            Mentions légales
          </a>
          <a href="#cgu" className="text-primary underline-offset-2 hover:underline whitespace-nowrap transition-colors">
            CGU / CGV
          </a>
          <a href="#confidentialite" className="text-primary underline-offset-2 hover:underline whitespace-nowrap transition-colors">
            Confidentialité
          </a>
        </nav>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-16 pb-24">
        <p className="text-xs text-muted-foreground text-center">
          Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        {/* ════════════════════════════════════ MENTIONS LÉGALES */}
        <section id="mentions-legales" className={sectionClass}>
          <h2 className={h2Class}>Mentions légales</h2>

          <div className={bodyClass}>
            <div>
              <h3 className={h3Class}>Éditeur du site</h3>
              <p>
                <strong className="text-foreground">Blyss</strong><br />
                Siège social : Annecy, 74000, France<br />
                Directeur de la publication : Noah Dekeyzer<br />
                Contact :{" "}
                <a href="mailto:contact@blyssapp.fr" className="text-primary hover:underline">
                  contact@blyssapp.fr
                </a>
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Hébergement</h3>
              <p>
                <strong className="text-foreground">Base de données &amp; stockage :</strong><br />
                Supabase Inc. — Infrastructure EU : Frankfurt, Allemagne (AWS eu-central-1)<br />
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialité Supabase →
                </a>
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Propriété intellectuelle</h3>
              <p>
                L'ensemble du contenu de la plateforme Blyss (textes, images, logo, interface graphique)
                est protégé par le droit d'auteur et le droit des marques. Toute reproduction ou utilisation
                sans autorisation écrite préalable est strictement interdite.
              </p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════ CGU / CGV */}
        <section id="cgu" className={sectionClass}>
          <h2 className={h2Class}>Conditions Générales d'Utilisation et de Vente</h2>

          <div className={bodyClass}>
            <div>
              <h3 className={h3Class}>1. Objet et acceptation</h3>
              <p>
                Les présentes Conditions Générales d'Utilisation (CGU) et Conditions Générales de Vente (CGV)
                régissent l'accès et l'utilisation de la plateforme{" "}
                <strong className="text-foreground">Blyss</strong>, accessible à l'adresse{" "}
                <strong className="text-foreground">app.blyssapp.fr</strong>.
              </p>
              <p className="mt-2">
                L'inscription sur Blyss vaut acceptation pleine et entière des présentes conditions.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>2. Description du service</h3>
              <p>
                Blyss est une application de gestion tout-en-un dédiée aux prothésistes ongulaires
                indépendantes et aux salons d'onglerie (ci-après « Pros ») ainsi qu'à leur clientèle
                (ci-après « Clientes »). Elle permet notamment :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>La gestion des réservations en ligne et de l'agenda</li>
                <li>La présentation des prestations et des tarifs</li>
                <li>Le traitement des paiements sécurisés via Stripe</li>
                <li>La gestion des acomptes pour réduire les no-shows</li>
                <li>Les notifications automatiques aux clientes</li>
                <li>La gestion des abonnements professionnels via RevenueCat</li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>3. Conditions d'accès</h3>
              <p>
                L'utilisation de Blyss est réservée aux personnes physiques âgées de 16 ans ou plus.
                L'inscription est gratuite. Les fonctionnalités avancées sont conditionnées
                à la souscription d'un abonnement payant (voir section 6).
              </p>
              <p className="mt-2">
                Chaque compte est strictement personnel et ne peut être partagé.
                L'utilisateur s'engage à fournir des informations exactes et à les maintenir à jour.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>4. Obligations des Professionnelles</h3>
              <p>Les Pros s'engagent à :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Proposer des prestations conformes à la réglementation française</li>
                <li>Honorer les réservations confirmées ou prévenir les clientes dans les meilleurs délais</li>
                <li>Maintenir leurs informations de profil et leurs tarifs à jour</li>
                <li>Respecter leurs obligations fiscales et sociales en tant qu'indépendantes</li>
                <li>Compléter l'onboarding Stripe pour activer les paiements en ligne</li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>5. Obligations des Clientes</h3>
              <p>Les Clientes s'engagent à :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Honorer les réservations effectuées ou les annuler dans les délais prévus par la Pro</li>
                <li>Régler les prestations selon les modalités convenues</li>
                <li>Ne pas effectuer de fausses réservations ni de faux avis</li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>6. Abonnements et tarification</h3>
              <p>Blyss propose trois formules d'abonnement pour les Pros :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>
                  <strong className="text-foreground">Start — 49,90 €/mois</strong> (sans engagement){" "}
                  — Accès aux fonctionnalités essentielles de gestion
                </li>
                <li>
                  <strong className="text-foreground">Sérénité — 39,90 €/mois</strong> (engagement 3 mois){" "}
                  — Réservations en ligne, paiements, agenda complet
                </li>
                <li>
                  <strong className="text-foreground">Signature — 29,90 €/mois</strong> (engagement 12 mois){" "}
                  — Accès complet : synchronisation Instagram, analytics, support prioritaire
                </li>
              </ul>
              <p className="mt-2">
                Les tarifs sont affichés TTC. Les abonnements sont gérés via RevenueCat.
                Toute modification tarifaire sera communiquée avec un préavis de 30 jours.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>7. Droit de rétractation et résiliation</h3>
              <p>
                Conformément à l'article L. 221-18 du Code de la consommation, un délai de rétractation
                de 14 jours s'applique après la souscription, sauf si l'exécution du service a débuté
                avec votre accord avant l'expiration de ce délai.
              </p>
              <p className="mt-2">
                La résiliation prend effet à la fin de la période en cours.
                Elle s'effectue depuis « Mon abonnement » dans vos paramètres, ou en contactant{" "}
                <a href="mailto:contact@blyssapp.fr" className="text-primary hover:underline">
                  contact@blyssapp.fr
                </a>.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>8. Paiements</h3>
              <p>
                Les paiements entre Clientes et Pros sont intégralement traités par{" "}
                <strong className="text-foreground">Stripe</strong>, prestataire certifié PCI-DSS.
                Blyss n'a jamais accès aux données de carte bancaire.
                Les Pros peuvent configurer des acomptes (0 %, 30 %, 50 % ou 100 %) pour sécuriser leurs réservations.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>9. Responsabilités</h3>
              <p>
                Blyss est une plateforme d'intermédiation technologique. Blyss ne saurait être tenu
                responsable des prestations réalisées entre Pros et Clientes, ni des litiges commerciaux
                en résultant. Chaque Pro exerce son activité en toute indépendance.
              </p>
              <p className="mt-2">
                Blyss s'engage à maintenir la disponibilité de la plateforme dans la mesure du possible.
                Des maintenances planifiées peuvent entraîner des interruptions temporaires.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>10. Droit applicable</h3>
              <p>
                Les présentes CGU sont soumises au{" "}
                <strong className="text-foreground">droit français</strong>. Tout litige sera porté
                devant les tribunaux compétents du ressort du siège social de Blyss (Annecy, France),
                sauf disposition légale contraire applicable aux consommateurs.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>11. Modification des CGU</h3>
              <p>
                Blyss se réserve le droit de modifier les présentes conditions. Les utilisateurs
                seront informés par notification in-app au moins 15 jours avant toute modification
                substantielle.
              </p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════ CONFIDENTIALITÉ */}
        <section id="confidentialite" className={sectionClass}>
          <h2 className={h2Class}>Politique de confidentialité</h2>

          <div className={bodyClass}>
            <div>
              <h3 className={h3Class}>Responsable du traitement</h3>
              <p>
                Blyss — Annecy, 74000, France<br />
                Contact données personnelles :{" "}
                <a href="mailto:privacy@blyssapp.fr" className="text-primary hover:underline">
                  privacy@blyssapp.fr
                </a>
                <br />
                Signaler une faille de sécurité :{" "}
                <a href="mailto:security@blyssapp.fr" className="text-primary hover:underline">
                  security@blyssapp.fr
                </a>
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Données collectées et traitées</h3>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs border-collapse min-w-[480px]">
                  <thead>
                    <tr className="bg-muted">
                      <th className="text-left p-2 font-semibold text-foreground border border-border">Donnée</th>
                      <th className="text-left p-2 font-semibold text-foreground border border-border">Finalité</th>
                      <th className="text-left p-2 font-semibold text-foreground border border-border">Base légale</th>
                      <th className="text-left p-2 font-semibold text-foreground border border-border">Durée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Nom, prénom", "Identification, affichage profil", "Contrat", "Durée du compte + 3 ans"],
                      ["Email", "Connexion, notifications", "Contrat", "Durée du compte + 3 ans"],
                      ["Téléphone", "Contact Pro/Cliente", "Contrat", "Durée du compte"],
                      ["Date de naissance", "Vérification âge (16+)", "Obligation légale", "Durée du compte"],
                      ["IBAN (chiffré AES-256-GCM)", "Virements via Stripe Connect", "Contrat", "Durée du compte + 5 ans"],
                      ["Photos (profil, bannière)", "Affichage public du profil", "Consentement", "Jusqu'à suppression"],
                      ["Réservations", "Gestion de l'activité Pro", "Contrat", "5 ans"],
                      ["Logs de connexion", "Sécurité, prévention fraude", "Intérêt légitime", "12 mois"],
                      ["Données carte bancaire", "Traitement Stripe (non stockées chez Blyss)", "Contrat", "N/A — Stripe"],
                    ].map(([data, purpose, basis, duration]) => (
                      <tr key={data} className="border-b border-border">
                        <td className="p-2 border border-border font-medium text-foreground">{data}</td>
                        <td className="p-2 border border-border">{purpose}</td>
                        <td className="p-2 border border-border">{basis}</td>
                        <td className="p-2 border border-border">{duration}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className={h3Class}>Cookies</h3>
              <p>
                Blyss utilise uniquement des cookies techniques strictement nécessaires au fonctionnement
                du service (authentification via cookies HttpOnly sécurisés, SameSite Strict). Aucun cookie
                publicitaire ni de tracking tiers n'est déposé.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Sous-traitants</h3>
              <div className="space-y-3">
                {[
                  {
                    name: "Stripe Inc.",
                    desc: "Traitement des paiements en ligne. Accord de traitement des données (DPA) signé. Transferts USA encadrés par les Clauses Contractuelles Types (CCT).",
                    url: "https://stripe.com/fr/privacy",
                    label: "Politique de confidentialité Stripe →",
                  },
                  {
                    name: "RevenueCat Inc.",
                    desc: "Gestion des abonnements. Transferts USA encadrés par les CCT.",
                    url: "https://www.revenuecat.com/privacy",
                    label: "Politique de confidentialité RevenueCat →",
                  },
                  {
                    name: "Supabase Inc.",
                    desc: "Hébergement de la base de données. Infrastructure EU (Frankfurt, Allemagne). DPA signé. Conformité RGPD.",
                    url: "https://supabase.com/privacy",
                    label: "Politique de confidentialité Supabase →",
                  },
                  {
                    name: "Meta Platforms Ireland Ltd.",
                    desc: "Intégration Instagram (portfolio photo). Transferts USA encadrés par les CCT.",
                    url: "https://www.facebook.com/legal/terms/dataprocessing",
                    label: "Data Processing Terms Meta →",
                  },
                  {
                    name: "Functional Software Inc. (Sentry)",
                    desc: "Monitoring des erreurs applicatives (logs anonymisés, sans données personnelles). Transferts USA encadrés par les CCT.",
                    url: "https://sentry.io/legal/dpa/",
                    label: "DPA Sentry →",
                  },
                ].map((st) => (
                  <div key={st.name} className="p-4 rounded-xl bg-muted/40 border border-border">
                    <p className="font-semibold text-foreground mb-1">{st.name}</p>
                    <p>{st.desc}</p>
                    <a href={st.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs mt-1 inline-block">
                      {st.label}
                    </a>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className={h3Class}>Vos droits</h3>
              <p>Conformément au RGPD, vous disposez des droits suivants :</p>
              <ul className="list-disc list-inside mt-2 space-y-2 ml-2">
                <li><strong className="text-foreground">Accès et portabilité</strong> — Export JSON depuis vos paramètres</li>
                <li><strong className="text-foreground">Rectification</strong> — Modification depuis vos paramètres</li>
                <li><strong className="text-foreground">Effacement</strong> — Suppression du compte depuis vos paramètres</li>
                <li><strong className="text-foreground">Opposition et limitation</strong> — Sur demande à{" "}
                  <a href="mailto:privacy@blyssapp.fr" className="text-primary hover:underline">privacy@blyssapp.fr</a>
                </li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>Sécurité des données</h3>
              <p>
                Chiffrement des données sensibles (IBAN en AES-256-GCM, tokens Instagram en AES-256-GCM),
                authentification par cookies HttpOnly (SameSite: Strict),
                communications TLS, contrôle d'accès par rôle (RBAC),
                Row-Level Security (RLS) Supabase.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Modifications</h3>
              <p>
                Toute modification substantielle fera l'objet d'une notification in-app
                au moins 15 jours avant son entrée en vigueur.
              </p>
            </div>
          </div>
        </section>

        {/* ── Pied de page ─────────────────────────────────────────── */}
        <div className="text-center text-xs text-muted-foreground py-8 border-t border-border space-y-1">
          <p>© {new Date().getFullYear()} Blyss — Tous droits réservés</p>
          <p>La plateforme tout-en-un pour prothésistes ongulaires</p>
          <Link to="/" className="text-primary hover:underline">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Legal;
