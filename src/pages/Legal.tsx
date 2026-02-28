import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

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
            <ArrowLeft size={22} className="text-foreground" aria-hidden="true" />
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
                <strong className="text-foreground">[NOM_EDITEUR]</strong><br />
                [FORME_JURIDIQUE] au capital de [CAPITAL]<br />
                Siège social : [ADRESSE_COMPLETE]<br />
                SIRET : [SIRET]<br />
                RCS : [RCS]<br />
                N° TVA intracommunautaire : [TVA_INTRACOM]<br />
                Directeur de la publication : [NOM_DIRECTEUR]<br />
                Contact :{" "}
                <a href="mailto:[EMAIL_CONTACT]" className="text-primary hover:underline">
                  [EMAIL_CONTACT]
                </a>
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Hébergement</h3>
              <p>
                <strong className="text-foreground">Base de données &amp; stockage :</strong><br />
                Supabase Inc. — 970 Toa Payoh North, Singapour<br />
                Infrastructure EU : Frankfurt, Allemagne (AWS eu-central-1)<br />
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Politique de confidentialité Supabase →
                </a>
              </p>
              <p className="mt-2">
                <strong className="text-foreground">Serveur applicatif :</strong><br />
                [NOM_HEBERGEUR_SERVEUR] — [ADRESSE_HEBERGEUR]
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Propriété intellectuelle</h3>
              <p>
                L'ensemble du contenu de la plateforme Blyss (textes, images, logo, interface graphique)
                est protégé par le droit d'auteur et le droit des marques. Toute reproduction ou utilisation
                sans autorisation écrite préalable de [NOM_EDITEUR] est strictement interdite.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Médiation de la consommation</h3>
              <p>
                Conformément à l'article L. 616-1 du Code de la consommation, en cas de litige
                non résolu amiablement, vous pouvez recourir gratuitement au service de médiation :{" "}
                [NOM_MEDIATEUR] — [URL_MEDIATEUR]
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
                <strong className="text-foreground">Blyss</strong>, éditée par [NOM_EDITEUR],
                accessible à l'adresse <strong className="text-foreground">app.blyssapp.fr</strong>.
              </p>
              <p className="mt-2">
                L'inscription sur Blyss vaut acceptation pleine et entière des présentes conditions.
                Si vous n'acceptez pas ces conditions, vous ne pouvez pas utiliser la plateforme.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>2. Description du service</h3>
              <p>
                Blyss est une plateforme SaaS de gestion d'activité destinée aux prothésistes ongulaires
                (ci-après « Pros ») et à leur clientèle (ci-après « Clients »). Elle permet notamment :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>La gestion des réservations et de l'agenda professionnel</li>
                <li>La présentation des prestations et des tarifs</li>
                <li>Le traitement des paiements en ligne via Stripe</li>
                <li>La gestion des abonnements via RevenueCat</li>
                <li>Les notifications et la communication entre Pros et Clients</li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>3. Conditions d'accès</h3>
              <p>
                L'utilisation de Blyss est réservée aux personnes physiques âgées de 16 ans ou plus.
                L'inscription est gratuite. Certaines fonctionnalités avancées sont conditionnées
                à la souscription d'un abonnement payant.
              </p>
              <p className="mt-2">
                Chaque compte est strictement personnel et ne peut être partagé.
                L'utilisateur s'engage à fournir des informations exactes lors de son inscription
                et à les maintenir à jour.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>4. Obligations des Professionnels</h3>
              <p>Les Pros s'engagent à :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Proposer des prestations conformes à la réglementation française en vigueur</li>
                <li>Honorer les réservations confirmées ou prévenir les Clients dans les meilleurs délais</li>
                <li>Maintenir leurs informations de profil et leurs tarifs à jour</li>
                <li>Se conformer à leurs obligations fiscales et sociales</li>
                <li>Compléter le processus d'onboarding Stripe pour recevoir des paiements</li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>5. Obligations des Clients</h3>
              <p>Les Clients s'engagent à :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>Honorer les réservations effectuées ou les annuler dans les délais prévus</li>
                <li>Régler les prestations selon les modalités convenues avec le Pro</li>
                <li>Ne pas effectuer de fausses réservations ni de faux avis</li>
              </ul>
            </div>

            <div>
              <h3 className={h3Class}>6. Abonnements et tarification</h3>
              <p>Blyss propose trois formules d'abonnement pour les Pros :</p>
              <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                <li>
                  <strong className="text-foreground">Start</strong> — Accès aux fonctionnalités essentielles
                </li>
                <li>
                  <strong className="text-foreground">Sérénité</strong> — Réservations en ligne,
                  paiements, agenda complet
                </li>
                <li>
                  <strong className="text-foreground">Signature</strong> — Accès complet : Instagram sync,
                  analytics avancés, support prioritaire
                </li>
              </ul>
              <p className="mt-2">
                Les tarifs sont affichés TTC et peuvent être modifiés moyennant un préavis de 30 jours.
                Les abonnements sont gérés via RevenueCat et facturés mensuellement ou annuellement
                selon l'option choisie.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>7. Droit de rétractation et résiliation</h3>
              <p>
                Conformément à l'article L. 221-18 du Code de la consommation, vous disposez d'un délai
                de 14 jours pour vous rétracter après la souscription d'un abonnement, sauf si vous avez
                demandé l'exécution immédiate du service avant l'expiration de ce délai.
              </p>
              <p className="mt-2">
                La résiliation d'un abonnement prend effet à la fin de la période en cours.
                Elle peut être effectuée depuis « Mon abonnement » dans vos paramètres, ou en contactant
                le support à{" "}
                <a href="mailto:[EMAIL_CONTACT]" className="text-primary hover:underline">
                  [EMAIL_CONTACT]
                </a>.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>8. Paiements</h3>
              <p>
                Les paiements entre Clients et Pros sont intégralement traités par{" "}
                <strong className="text-foreground">Stripe</strong>, prestataire certifié PCI-DSS.
                Blyss n'a jamais accès aux données de carte bancaire.
                Des acomptes configurables (0 %, 30 %, 50 % ou 100 % du montant) peuvent être mis en place
                par chaque Pro.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>9. Responsabilités</h3>
              <p>
                Blyss est une plateforme d'intermédiation. [NOM_EDITEUR] ne saurait être tenu responsable
                des prestations réalisées entre Pros et Clients, ni des litiges commerciaux en résultant.
              </p>
              <p className="mt-2">
                [NOM_EDITEUR] s'engage à maintenir la disponibilité de la plateforme dans la mesure du
                possible, sans garantir une disponibilité ininterrompue. Des maintenances planifiées
                peuvent entraîner des interruptions temporaires.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>10. Droit applicable et juridiction compétente</h3>
              <p>
                Les présentes CGU sont soumises au{" "}
                <strong className="text-foreground">droit français</strong>. Tout litige relatif
                à leur interprétation ou à leur exécution sera porté devant les tribunaux compétents
                du ressort du siège social de [NOM_EDITEUR], sauf disposition légale contraire
                applicable aux consommateurs.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>11. Modification des CGU</h3>
              <p>
                [NOM_EDITEUR] se réserve le droit de modifier les présentes conditions. Les utilisateurs
                seront informés par email et/ou notification in-app au moins 15 jours avant toute
                modification substantielle entrant en vigueur.
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
                [NOM_EDITEUR] — [ADRESSE_COMPLETE]<br />
                Délégué à la Protection des Données (DPO) :{" "}
                <a href="mailto:[EMAIL_DPO]" className="text-primary hover:underline">
                  [EMAIL_DPO]
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
                      ["Téléphone", "Contact Pro/Client", "Contrat", "Durée du compte"],
                      ["Date de naissance", "Vérification âge (16+ ans)", "Obligation légale", "Durée du compte"],
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
                du service (authentification via cookies HttpOnly sécurisés, session). Aucun cookie
                publicitaire ni de tracking tiers n'est déposé sans votre consentement explicite.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Sous-traitants (art. 28 RGPD)</h3>
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-muted/40 border border-border">
                  <p className="font-semibold text-foreground mb-1">Stripe Inc.</p>
                  <p>
                    Traitement des paiements en ligne. Accord de traitement des données (DPA) signé.
                    Transfert vers les USA encadré par les Clauses Contractuelles Types (CCT) de la
                    Commission Européenne.
                  </p>
                  <a
                    href="https://stripe.com/fr/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs mt-1 inline-block"
                  >
                    Politique de confidentialité Stripe →
                  </a>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border">
                  <p className="font-semibold text-foreground mb-1">RevenueCat Inc.</p>
                  <p>
                    Gestion des abonnements. DPA disponible sur demande.
                    Transfert vers les USA encadré par les CCT.
                  </p>
                  <a
                    href="https://www.revenuecat.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs mt-1 inline-block"
                  >
                    Politique de confidentialité RevenueCat →
                  </a>
                </div>
                <div className="p-4 rounded-xl bg-muted/40 border border-border">
                  <p className="font-semibold text-foreground mb-1">Supabase Inc.</p>
                  <p>
                    Hébergement de la base de données et du stockage des fichiers.
                    Infrastructure EU (Frankfurt, Allemagne). DPA signé. Conformité RGPD.
                  </p>
                  <a
                    href="https://supabase.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-xs mt-1 inline-block"
                  >
                    Politique de confidentialité Supabase →
                  </a>
                </div>
              </div>
            </div>

            <div>
              <h3 className={h3Class}>Vos droits RGPD</h3>
              <p>
                Conformément au RGPD (règlement UE 2016/679) et à la loi Informatique et Libertés,
                vous disposez des droits suivants :
              </p>
              <ul className="list-disc list-inside mt-2 space-y-2 ml-2">
                <li>
                  <strong className="text-foreground">Accès et portabilité</strong> — Exporter
                  l'ensemble de vos données depuis vos paramètres (export JSON)
                </li>
                <li>
                  <strong className="text-foreground">Rectification</strong> — Modifier vos
                  informations personnelles depuis vos paramètres
                </li>
                <li>
                  <strong className="text-foreground">Effacement (« droit à l'oubli »)</strong> —
                  Supprimer votre compte et toutes vos données depuis vos paramètres
                </li>
                <li>
                  <strong className="text-foreground">Opposition et limitation</strong> — Sur
                  demande auprès de notre DPO
                </li>
                <li>
                  <strong className="text-foreground">Réclamation</strong> — Auprès de la CNIL :{" "}
                  <a
                    href="https://www.cnil.fr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    cnil.fr
                  </a>
                </li>
              </ul>
              <p className="mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-xs">
                Pour exercer vos droits ou contacter notre DPO :{" "}
                <a href="mailto:[EMAIL_DPO]" className="text-primary hover:underline font-semibold">
                  [EMAIL_DPO]
                </a>
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Sécurité des données</h3>
              <p>
                Nous mettons en œuvre des mesures techniques et organisationnelles appropriées :
                chiffrement des données sensibles (IBAN en AES-256-GCM, tokens en AES-256-GCM),
                authentification par cookies HttpOnly sécurisés (SameSite: Strict),
                communications chiffrées TLS, contrôle d'accès par rôle (RBAC),
                Row-Level Security (RLS) Supabase.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Transferts hors UE</h3>
              <p>
                Les transferts de données hors de l'Union Européenne (vers Stripe, RevenueCat)
                sont encadrés par des Clauses Contractuelles Types approuvées par la Commission
                Européenne conformément à l'article 46 du RGPD.
              </p>
            </div>

            <div>
              <h3 className={h3Class}>Modifications de cette politique</h3>
              <p>
                Toute modification substantielle fera l'objet d'une notification par email et/ou
                notification in-app au moins 15 jours avant son entrée en vigueur.
              </p>
            </div>
          </div>
        </section>

        {/* ── Pied de page ─────────────────────────────────────────── */}
        <div className="text-center text-xs text-muted-foreground py-8 border-t border-border space-y-1">
          <p>© {new Date().getFullYear()} [NOM_EDITEUR] — Tous droits réservés</p>
          <p>Blyss — La plateforme tout-en-un pour prothésistes ongulaires</p>
          <Link to="/" className="text-primary hover:underline">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Legal;
