-- ============================================================
-- Blyss App — Seed de développement
-- Mots de passe : Admin123! / Pro123! / Client123!
-- ============================================================

-- Nettoyage propre (ordre inverse des FK)
TRUNCATE TABLE
  instagram_sync_log,
  instagram_media_cache,
  instagram_connections,
  favorites,
  revenucat_webhooks,
  payment_methods,
  payments,
  subscriptions,
  pro_client_notes,
  pro_notification_settings,
  client_notification_settings,
  notification_preferences,
  notifications,
  reviews,
  reservations,
  slots,
  prestations,
  refresh_tokens,
  users
RESTART IDENTITY CASCADE;

-- ============================================================
-- Utilisateurs
-- admin   → Admin123!
-- pro     → Pro123!
-- client  → Client123!
-- ============================================================
INSERT INTO users (
  first_name, last_name, email, password_hash, phone_number, birth_date,
  role, is_admin, pro_status, activity_name, city, bio, specialty,
  latitude, longitude, geo_precision,
  profile_visibility, accept_online_payment, is_active
) VALUES
  -- ── Admin (id=1) ───────────────────────────────────────────────────────────
  ('Sophie', 'Martin', 'admin@blyss.dev',
   '$2b$10$1E1dIvgKCDVo3uSCVh7Jj.ljyXkJbRNb5tXUP6yOwFn0MQx.KvgE6',
   '0601010101', '1988-04-12', 'admin', TRUE, 'active',
   NULL, 'Paris', NULL, NULL, NULL, NULL, 'city',
   'public', FALSE, TRUE),

  -- ── Pros historiques ────────────────────────────────────────────────────────
  -- Camille (id=2) — Paris 8e, adresse précise
  ('Camille', 'Dubois', 'camille@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0612121212', '1990-07-22', 'pro', FALSE, 'active',
   'Camille Beauty', 'Paris',
   'Prothésiste ongulaire certifiée depuis 10 ans. Spécialiste gel, semi-permanent et nail art élaboré. Mon studio est situé dans le 8e arrondissement.',
   'Gel & semi-permanent',
   48.8744, 2.3088, 'address',
   'public', TRUE, TRUE),

  -- Lucas (id=3) — Lyon, centre-ville
  ('Lucas', 'Bernard', 'lucas@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0623232323', '1985-03-15', 'pro', FALSE, 'active',
   'Lucas Hair', 'Lyon',
   'Coiffeur expert — coupes modernes & colorations. Basé à Lyon Part-Dieu.',
   'Coiffure & couleur',
   45.7607, 4.8530, 'city',
   'public', TRUE, TRUE),

  -- Emma (id=4) — Bordeaux, adresse précise
  ('Emma', 'Leroy', 'emma@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0634343434', '1993-11-08', 'pro', FALSE, 'active',
   'Emma Nail Art', 'Bordeaux',
   'Nail art & manucure haut de gamme. Formations certifiées en France et en Italie. Atelier situé en plein cœur de Bordeaux.',
   'Nail art & manucure',
   44.8400, -0.5750, 'address',
   'public', FALSE, TRUE),

  -- ── Clients (id=5,6,7) ──────────────────────────────────────────────────────
  ('Léa', 'Moreau', 'lea@blyss.dev',
   '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy',
   '0645454545', '1997-09-01', 'client', FALSE, NULL,
   NULL, 'Paris', NULL, NULL, NULL, NULL, 'city',
   'public', FALSE, TRUE),

  ('Noah', 'Petit', 'noah@blyss.dev',
   '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy',
   '0656565656', '1995-06-18', 'client', FALSE, NULL,
   NULL, 'Lyon', NULL, NULL, NULL, NULL, 'city',
   'public', FALSE, TRUE),

  ('Jade', 'Simon', 'jade@blyss.dev',
   '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy',
   '0667676767', '2000-01-25', 'client', FALSE, NULL,
   NULL, 'Bordeaux', NULL, NULL, NULL, NULL, 'city',
   'public', FALSE, TRUE),

  -- ── Nouvelles pros (id=8-19) ────────────────────────────────────────────────

  -- Inès (id=8) — Paris 11e, adresse précise — gel & baby boomer
  ('Inès', 'Bertrand', 'ines@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0678787878', '1992-05-14', 'pro', FALSE, 'active',
   'Ongles Dorés', 'Paris',
   'Spécialiste pose de gel et baby boomer depuis 7 ans. Studio cosy dans le 11e, RDV uniquement.',
   'Pose de gel & baby boomer',
   48.8629, 2.3817, 'address',
   'public', TRUE, TRUE),

  -- Marine (id=9) — Lyon Part-Dieu, adresse précise — nail art
  ('Marine', 'Dupont', 'marine@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0689898989', '1994-08-03', 'pro', FALSE, 'active',
   'Marine Nail Studio', 'Lyon',
   'Nail art créatif et personnalisé. Chaque création est unique. Basée à Lyon, je me déplace aussi à domicile.',
   'Nail art créatif',
   45.7610, 4.8557, 'address',
   'public', TRUE, TRUE),

  -- Yasmine (id=10) — Marseille, centre-ville — manucure & semi-permanent
  ('Yasmine', 'Farid', 'yasmine@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0690909090', '1991-12-20', 'pro', FALSE, 'active',
   'Yasmine Nails', 'Marseille',
   'Manucure premium et semi-permanent longue durée. À Marseille depuis 2016.',
   'Manucure & semi-permanent',
   43.2965, 5.3698, 'city',
   'public', FALSE, TRUE),

  -- Chloé (id=11) — Nice, centre-ville — french & manucure
  ('Chloé', 'Renard', 'chloe@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0701010101', '1996-03-07', 'pro', FALSE, 'active',
   'Chloé Beauty Nails', 'Nice',
   'Spécialiste french manucure et manucure classique. Studio avec vue sur la promenade.',
   'French & manucure',
   43.7102, 7.2620, 'city',
   'public', TRUE, TRUE),

  -- Anaïs (id=12) — Toulouse, adresse précise — gel & nail art
  ('Anaïs', 'Bourdin', 'anais@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0712121212', '1993-07-30', 'pro', FALSE, 'active',
   'Anaïs Pro Nails', 'Toulouse',
   'Prothésiste ongulaire passionnée. Pose de gel, nail art et baby boomer. Mon studio est au cœur de Toulouse.',
   'Pose de gel & nail art',
   43.6047, 1.4442, 'address',
   'public', TRUE, TRUE),

  -- Pauline (id=13) — Bordeaux, adresse précise — nail art & baby boomer
  ('Pauline', 'Vidal', 'pauline@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0723232323', '1990-11-15', 'pro', FALSE, 'active',
   'Pauline Nail Art', 'Bordeaux',
   'Nail art élaboré et baby boomer naturel. Studio bien équipé à Bordeaux Chartrons.',
   'Nail art & baby boomer',
   44.8512, -0.5695, 'address',
   'public', TRUE, TRUE),

  -- Léonie (id=14) — Nantes, centre-ville — manucure & french
  ('Léonie', 'Morin', 'leonie@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0734343434', '1995-02-22', 'pro', FALSE, 'active',
   'Léonie Nails', 'Nantes',
   'Manucure et french manucure haut de gamme. Je soigne chaque détail pour un résultat parfait.',
   'Manucure & french',
   47.2184, -1.5536, 'city',
   'public', FALSE, TRUE),

  -- Sonia (id=15) — Strasbourg, adresse précise — gel & french
  ('Sonia', 'Klein', 'sonia@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0745454545', '1988-09-05', 'pro', FALSE, 'active',
   'Sonia Nails Strasbourg', 'Strasbourg',
   'Spécialiste gel et french depuis 12 ans. Certifiée en Allemagne et en France. Studio dans la Petite France.',
   'Pose de gel & french',
   48.5793, 7.7465, 'address',
   'public', TRUE, TRUE),

  -- Océane (id=16) — Lille, centre-ville — semi-permanent & nail art
  ('Océane', 'Girard', 'oceane@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0756565656', '1997-06-18', 'pro', FALSE, 'active',
   'Océane Beauty', 'Lille',
   'Semi-permanent et nail art tendance. Influenceuse beauté & prothésiste depuis 5 ans à Lille.',
   'Semi-permanent & nail art',
   50.6292, 3.0573, 'city',
   'public', TRUE, TRUE),

  -- Clara (id=17) — Montpellier, adresse précise — gel & baby boomer
  ('Clara', 'Blanc', 'clara@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0767676767', '1994-04-11', 'pro', FALSE, 'active',
   'Clara Nails', 'Montpellier',
   'Baby boomer et gel naturel, c''est ma spécialité. Studio au cœur de Montpellier, facilement accessible.',
   'Gel & baby boomer',
   43.6108, 3.8767, 'address',
   'public', TRUE, TRUE),

  -- Lucie (id=18) — Rennes, centre-ville — nail art créatif
  ('Lucie', 'Thomas', 'lucie@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0778787878', '1996-01-08', 'pro', FALSE, 'active',
   'Lucie Nail Art', 'Rennes',
   'Nail art créatif et coloré. Chaque set est une œuvre d''art. Basée à Rennes depuis 2020.',
   'Nail art créatif',
   48.1173, -1.6778, 'city',
   'public', FALSE, TRUE),

  -- Sofia (id=19) — Paris 18e, adresse précise — manucure & semi-permanent
  ('Sofia', 'Perrin', 'sofia@blyss.dev',
   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e',
   '0789898989', '1991-10-27', 'pro', FALSE, 'active',
   'Sofia Nails Paris', 'Paris',
   'Prothésiste ongulaire basée à Montmartre (18e). Semi-permanent et manucure classique ou gel. Débutants bienvenus.',
   'Manucure & semi-permanent',
   48.8867, 2.3431, 'address',
   'public', TRUE, TRUE);

-- IDs : admin=1, camille=2, lucas=3, emma=4, lea=5, noah=6, jade=7
-- ines=8, marine=9, yasmine=10, chloe=11, anais=12, pauline=13
-- leonie=14, sonia=15, oceane=16, clara=17, lucie=18, sofia=19

-- ============================================================
-- Prestations (pros historiques)
-- ============================================================
INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active) VALUES
  -- Camille (2)
  (2, 'Soin visage éclat',          'Nettoyage profond + masque hydratant.',          65.00,  60,  TRUE),
  (2, 'Massage relaxant 60 min',    'Massage dos & épaules aux huiles essentielles.',  80.00,  60,  TRUE),
  (2, 'Pose gel couleur',           'Pose gel longue durée + top coat brillant.',      65.00,  75,  TRUE),
  (2, 'Semi-permanent',             'Pose semi-permanent + soin cuticules.',            45.00,  60,  TRUE),
  -- Lucas (3)
  (3, 'Coupe femme',                'Coupe + brushing sur cheveux secs.',              55.00,  60,  TRUE),
  (3, 'Coupe homme',                'Coupe + finition rasoir.',                         35.00,  45,  TRUE),
  (3, 'Coloration complète',        'Couleur + soin + brushing.',                      95.00, 120,  TRUE),
  -- Emma (4)
  (4, 'Manucure classique',         'Lime + base + vernis couleur.',                   35.00,  45,  TRUE),
  (4, 'Pose gel full cover',        'Pose de gel couleur + nail art simple.',           60.00,  75,  TRUE),
  (4, 'Nail art créatif',           'Design personnalisé sur demande.',                 80.00,  90,  TRUE),
  (4, 'Baby boomer',                'Effet dégradé rose/blanc naturel en gel.',         70.00,  90,  TRUE),
  -- Inès (8)
  (8, 'Pose gel couleur',           'Gel couleur longue durée, choix parmi 200 teintes.', 65.00, 75, TRUE),
  (8, 'Baby boomer gel',            'Dégradé rose-blanc ultra naturel en gel.',          75.00,  90, TRUE),
  (8, 'Remplissage gel',            'Remplissage 3-4 semaines après pose initiale.',     45.00,  60, TRUE),
  -- Marine (9)
  (9, 'Nail art 1 doigt',           'Design créatif sur 1 doigt accent.',               15.00,  20, TRUE),
  (9, 'Nail art complet',           'Design personnalisé sur tous les ongles.',          95.00, 120, TRUE),
  (9, 'Semi-permanent + nail art',  'Pose semi-permanent + nail art 2 doigts.',          65.00,  75, TRUE),
  -- Yasmine (10)
  (10, 'Manucure semi-permanent',   'Pose semi-permanent + soin cuticules.',             50.00,  60, TRUE),
  (10, 'Manucure classique',        'Lime, cuticules, base, vernis.',                    30.00,  45, TRUE),
  (10, 'Dépose semi-permanent',     'Dépose en douceur + soin hydratant.',               20.00,  30, TRUE),
  -- Chloé (11)
  (11, 'French manucure',           'French classique au gel ou vernis.',                45.00,  60, TRUE),
  (11, 'Manucure spa',              'Bain, gommage, masque + vernis.',                   55.00,  75, TRUE),
  (11, 'French semi-permanent',     'French en semi-permanent 3-4 semaines.',            55.00,  60, TRUE),
  -- Anaïs (12)
  (12, 'Pose gel naturel',          'Extension gel ultra naturelle, look "no-nail".',    70.00,  90, TRUE),
  (12, 'Nail art géométrique',      'Motifs géométriques minimalistes.',                 80.00, 100, TRUE),
  (12, 'Baby boomer',               'Dégradé discret rose poudré et blanc.',             72.00,  90, TRUE),
  -- Pauline (13)
  (13, 'Nail art aquarelle',        'Effet peinture aquarelle sur gel.',                 90.00, 110, TRUE),
  (13, 'Baby boomer élaboré',       'Dégradé avec paillettes et strass.',                80.00,  95, TRUE),
  (13, 'Nail art floral',           'Fleurs délicates peintes à la main.',               85.00, 100, TRUE),
  -- Léonie (14)
  (14, 'Manucure classique',        'Lime, cuticules, base + vernis semi-perm.',         40.00,  50, TRUE),
  (14, 'French gel',                'French en gel longue durée.',                       55.00,  70, TRUE),
  (14, 'Soin mains intensif',       'Bain, gommage, masque, massage + vernis.',          60.00,  80, TRUE),
  -- Sonia (15)
  (15, 'Pose gel couleur',          'Gel haute qualité importé, tenue 6 semaines.',      70.00,  80, TRUE),
  (15, 'French gel ultra-précis',   'Sourire millimétré, technique master.',             75.00,  85, TRUE),
  (15, 'Remplissage',               'Remplissage gel toutes 3-4 semaines.',              50.00,  60, TRUE),
  -- Océane (16)
  (16, 'Semi-permanent tendance',   'Couleurs de saison + finition mate ou brillante.',  50.00,  60, TRUE),
  (16, 'Nail art moderne',          'Inspirations Instagram, tendances actuelles.',       75.00,  90, TRUE),
  (16, 'Dépose + nouvelle pose',    'Dépose semi-perm + nouvelle couleur.',               65.00,  75, TRUE),
  -- Clara (17)
  (17, 'Baby boomer signature',     'Ma spécialité : baby boomer ultra naturel.',         78.00,  95, TRUE),
  (17, 'Gel naturel',               'Extension courte, effet ongle naturel renforcé.',    68.00,  80, TRUE),
  (17, 'Pose gel + nail art 2 doigts', 'Gel couleur + accent art sur 2 ongles.',         80.00,  90, TRUE),
  -- Lucie (18)
  (18, 'Nail art créatif',          'Chaque set est unique, créé selon tes envies.',      90.00, 110, TRUE),
  (18, 'Nail art minimaliste',      'Lignes fines et détails discrets.',                   65.00,  80, TRUE),
  (18, 'Semi-permanent + art',      'Semi-perm + nail art créatif 4 doigts.',              75.00,  90, TRUE),
  -- Sofia (19)
  (19, 'Manucure classique',        'Soin complet + vernis classique.',                    35.00,  45, TRUE),
  (19, 'Semi-permanent',            'Pose semi-permanent + soin cuticules.',               48.00,  60, TRUE),
  (19, 'Gel naturel débutantes',    'Idéal pour essayer le gel pour la 1ère fois.',        60.00,  75, TRUE);

-- ============================================================
-- Slots (futures dates)
-- ============================================================
INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status) VALUES
  -- Camille (2)
  (2, NOW() + INTERVAL '1 day'  + TIME '09:00', NOW() + INTERVAL '1 day'  + TIME '10:00', 60, 'available'),
  (2, NOW() + INTERVAL '1 day'  + TIME '10:30', NOW() + INTERVAL '1 day'  + TIME '11:30', 60, 'available'),
  (2, NOW() + INTERVAL '2 days' + TIME '14:00', NOW() + INTERVAL '2 days' + TIME '15:30', 90, 'booked'),
  (2, NOW() + INTERVAL '3 days' + TIME '11:00', NOW() + INTERVAL '3 days' + TIME '12:00', 60, 'available'),
  (2, NOW() + INTERVAL '5 days' + TIME '09:00', NOW() + INTERVAL '5 days' + TIME '10:00', 60, 'available'),
  -- Lucas (3)
  (3, NOW() + INTERVAL '1 day'  + TIME '10:00', NOW() + INTERVAL '1 day'  + TIME '10:45', 45, 'available'),
  (3, NOW() + INTERVAL '1 day'  + TIME '11:00', NOW() + INTERVAL '1 day'  + TIME '13:00', 120,'available'),
  (3, NOW() + INTERVAL '2 days' + TIME '15:00', NOW() + INTERVAL '2 days' + TIME '15:45', 45, 'booked'),
  (3, NOW() + INTERVAL '4 days' + TIME '09:30', NOW() + INTERVAL '4 days' + TIME '10:15', 45, 'available'),
  -- Emma (4)
  (4, NOW() + INTERVAL '1 day'  + TIME '13:00', NOW() + INTERVAL '1 day'  + TIME '13:45', 45, 'available'),
  (4, NOW() + INTERVAL '2 days' + TIME '10:00', NOW() + INTERVAL '2 days' + TIME '11:15', 75, 'available'),
  (4, NOW() + INTERVAL '3 days' + TIME '14:00', NOW() + INTERVAL '3 days' + TIME '15:30', 90, 'booked'),
  -- Inès (8)
  (8, NOW() + INTERVAL '1 day'  + TIME '11:00', NOW() + INTERVAL '1 day'  + TIME '12:15', 75, 'available'),
  (8, NOW() + INTERVAL '3 days' + TIME '10:00', NOW() + INTERVAL '3 days' + TIME '11:30', 90, 'available'),
  (8, NOW() + INTERVAL '5 days' + TIME '14:00', NOW() + INTERVAL '5 days' + TIME '15:15', 75, 'available'),
  -- Marine (9)
  (9, NOW() + INTERVAL '2 days' + TIME '09:00', NOW() + INTERVAL '2 days' + TIME '11:00', 120,'available'),
  (9, NOW() + INTERVAL '4 days' + TIME '13:00', NOW() + INTERVAL '4 days' + TIME '14:15', 75, 'available'),
  -- Yasmine (10)
  (10, NOW() + INTERVAL '1 day' + TIME '09:30', NOW() + INTERVAL '1 day' + TIME '10:30', 60, 'available'),
  (10, NOW() + INTERVAL '2 days'+ TIME '14:00', NOW() + INTERVAL '2 days'+ TIME '15:00', 60, 'available'),
  -- Chloé (11)
  (11, NOW() + INTERVAL '1 day' + TIME '10:00', NOW() + INTERVAL '1 day' + TIME '11:00', 60, 'available'),
  (11, NOW() + INTERVAL '3 days'+ TIME '15:00', NOW() + INTERVAL '3 days'+ TIME '16:15', 75, 'available'),
  -- Anaïs (12)
  (12, NOW() + INTERVAL '2 days'+ TIME '09:00', NOW() + INTERVAL '2 days'+ TIME '10:30', 90, 'available'),
  (12, NOW() + INTERVAL '4 days'+ TIME '11:00', NOW() + INTERVAL '4 days'+ TIME '12:40', 100,'available'),
  -- Pauline (13)
  (13, NOW() + INTERVAL '1 day' + TIME '14:00', NOW() + INTERVAL '1 day' + TIME '15:50', 110,'available'),
  (13, NOW() + INTERVAL '5 days'+ TIME '10:00', NOW() + INTERVAL '5 days'+ TIME '11:40', 100,'available'),
  -- Léonie (14)
  (14, NOW() + INTERVAL '1 day' + TIME '09:00', NOW() + INTERVAL '1 day' + TIME '09:50', 50, 'available'),
  (14, NOW() + INTERVAL '3 days'+ TIME '13:00', NOW() + INTERVAL '3 days'+ TIME '14:20', 80, 'available'),
  -- Sonia (15) — planning avril-mai 2026
  (15, NOW() + INTERVAL '1 day'  + TIME '09:00', NOW() + INTERVAL '1 day'  + TIME '10:25', 85, 'available'),
  (15, NOW() + INTERVAL '1 day'  + TIME '11:00', NOW() + INTERVAL '1 day'  + TIME '12:00', 60, 'available'),
  (15, NOW() + INTERVAL '2 days' + TIME '10:00', NOW() + INTERVAL '2 days' + TIME '11:25', 85, 'available'),
  (15, NOW() + INTERVAL '2 days' + TIME '14:00', NOW() + INTERVAL '2 days' + TIME '15:00', 60, 'available'),
  (15, NOW() + INTERVAL '3 days' + TIME '09:00', NOW() + INTERVAL '3 days' + TIME '10:25', 85, 'available'),
  (15, NOW() + INTERVAL '3 days' + TIME '11:00', NOW() + INTERVAL '3 days' + TIME '12:25', 85, 'available'),
  (15, NOW() + INTERVAL '4 days' + TIME '14:00', NOW() + INTERVAL '4 days' + TIME '15:00', 60, 'available'),
  (15, NOW() + INTERVAL '4 days' + TIME '15:30', NOW() + INTERVAL '4 days' + TIME '16:55', 85, 'available'),
  (15, NOW() + INTERVAL '5 days' + TIME '10:00', NOW() + INTERVAL '5 days' + TIME '11:00', 60, 'available'),
  (15, NOW() + INTERVAL '6 days' + TIME '09:00', NOW() + INTERVAL '6 days' + TIME '10:00', 60, 'available'),
  (15, NOW() + INTERVAL '6 days' + TIME '10:30', NOW() + INTERVAL '6 days' + TIME '11:55', 85, 'available'),
  (15, NOW() + INTERVAL '7 days' + TIME '14:00', NOW() + INTERVAL '7 days' + TIME '15:25', 85, 'available'),
  (15, NOW() + INTERVAL '8 days' + TIME '09:00', NOW() + INTERVAL '8 days' + TIME '10:00', 60, 'available'),
  (15, NOW() + INTERVAL '8 days' + TIME '11:00', NOW() + INTERVAL '8 days' + TIME '12:25', 85, 'available'),
  (15, NOW() + INTERVAL '9 days' + TIME '10:00', NOW() + INTERVAL '9 days' + TIME '11:00', 60, 'available'),
  (15, NOW() + INTERVAL '9 days' + TIME '14:00', NOW() + INTERVAL '9 days' + TIME '15:00', 60, 'available'),
  (15, NOW() + INTERVAL '10 days'+ TIME '09:00', NOW() + INTERVAL '10 days'+ TIME '10:25', 85, 'available'),
  (15, NOW() + INTERVAL '11 days'+ TIME '10:00', NOW() + INTERVAL '11 days'+ TIME '11:00', 60, 'available'),
  (15, NOW() + INTERVAL '11 days'+ TIME '14:00', NOW() + INTERVAL '11 days'+ TIME '15:25', 85, 'available'),
  (15, NOW() + INTERVAL '12 days'+ TIME '09:00', NOW() + INTERVAL '12 days'+ TIME '10:00', 60, 'available'),
  (15, NOW() + INTERVAL '13 days'+ TIME '11:00', NOW() + INTERVAL '13 days'+ TIME '12:25', 85, 'available'),
  (15, NOW() + INTERVAL '14 days'+ TIME '09:00', NOW() + INTERVAL '14 days'+ TIME '10:00', 60, 'available'),
  (15, NOW() + INTERVAL '14 days'+ TIME '10:30', NOW() + INTERVAL '14 days'+ TIME '11:55', 85, 'available'),
  (15, NOW() + INTERVAL '15 days'+ TIME '14:00', NOW() + INTERVAL '15 days'+ TIME '15:00', 60, 'available'),
  (15, NOW() + INTERVAL '16 days'+ TIME '10:00', NOW() + INTERVAL '16 days'+ TIME '11:25', 85, 'available'),
  (15, NOW() + INTERVAL '17 days'+ TIME '09:00', NOW() + INTERVAL '17 days'+ TIME '10:00', 60, 'available'),
  (15, NOW() + INTERVAL '18 days'+ TIME '11:00', NOW() + INTERVAL '18 days'+ TIME '12:00', 60, 'available'),
  (15, NOW() + INTERVAL '19 days'+ TIME '14:00', NOW() + INTERVAL '19 days'+ TIME '15:25', 85, 'available'),
  (15, NOW() + INTERVAL '20 days'+ TIME '09:00', NOW() + INTERVAL '20 days'+ TIME '10:25', 85, 'available'),
  (15, NOW() + INTERVAL '21 days'+ TIME '10:00', NOW() + INTERVAL '21 days'+ TIME '11:00', 60, 'available'),
  -- Océane (16)
  (16, NOW() + INTERVAL '1 day' + TIME '11:00', NOW() + INTERVAL '1 day' + TIME '12:00', 60, 'available'),
  (16, NOW() + INTERVAL '3 days'+ TIME '09:00', NOW() + INTERVAL '3 days'+ TIME '10:30', 90, 'available'),
  -- Clara (17)
  (17, NOW() + INTERVAL '2 days'+ TIME '10:00', NOW() + INTERVAL '2 days'+ TIME '11:35', 95, 'available'),
  (17, NOW() + INTERVAL '5 days'+ TIME '13:00', NOW() + INTERVAL '5 days'+ TIME '14:20', 80, 'available'),
  -- Lucie (18)
  (18, NOW() + INTERVAL '1 day' + TIME '14:00', NOW() + INTERVAL '1 day' + TIME '15:50', 110,'available'),
  (18, NOW() + INTERVAL '4 days'+ TIME '10:00', NOW() + INTERVAL '4 days'+ TIME '11:20', 80, 'available'),
  -- Sofia (19)
  (19, NOW() + INTERVAL '1 day' + TIME '09:00', NOW() + INTERVAL '1 day' + TIME '09:45', 45, 'available'),
  (19, NOW() + INTERVAL '2 days'+ TIME '15:00', NOW() + INTERVAL '2 days'+ TIME '16:00', 60, 'available'),
  (19, NOW() + INTERVAL '4 days'+ TIME '11:00', NOW() + INTERVAL '4 days'+ TIME '12:15', 75, 'available');

-- ============================================================
-- Réservations
-- ============================================================
INSERT INTO reservations (
  client_id, pro_id, prestation_id, slot_id,
  start_datetime, end_datetime,
  status, price, paid_online, payment_status, total_paid, deposit_amount
) VALUES
  -- Léa (5) chez Camille (2) — slot 3 (booked)
  (5, 2, 3, 3,
   NOW() + INTERVAL '2 days' + TIME '14:00',
   NOW() + INTERVAL '2 days' + TIME '15:30',
   'confirmed', 65.00, TRUE, 'deposit_paid', 32.50, 32.50),
  -- Noah (6) chez Lucas (3) — slot 8 (booked)
  (6, 3, 6, 8,
   NOW() + INTERVAL '2 days' + TIME '15:00',
   NOW() + INTERVAL '2 days' + TIME '15:45',
   'confirmed', 35.00, FALSE, 'paid_on_site', 0.00, NULL),
  -- Jade (7) chez Emma (4) — slot 12 (booked)
  (7, 4, 8, 12,
   NOW() + INTERVAL '3 days' + TIME '14:00',
   NOW() + INTERVAL '3 days' + TIME '15:30',
   'confirmed', 60.00, TRUE, 'fully_paid', 60.00, NULL),
  -- Réservations passées (complétées)
  (5, 3, 5, NULL,
   NOW() - INTERVAL '7 days'  + TIME '10:00',
   NOW() - INTERVAL '7 days'  + TIME '11:00',
   'completed', 55.00, FALSE, 'paid_on_site', 55.00, NULL),
  (6, 2, 1, NULL,
   NOW() - INTERVAL '14 days' + TIME '09:00',
   NOW() - INTERVAL '14 days' + TIME '10:00',
   'completed', 65.00, TRUE, 'fully_paid', 65.00, NULL),
  (5, 8, 12, NULL,
   NOW() - INTERVAL '10 days' + TIME '11:00',
   NOW() - INTERVAL '10 days' + TIME '12:15',
   'completed', 65.00, TRUE, 'fully_paid', 65.00, NULL),
  (6, 9, 15, NULL,
   NOW() - INTERVAL '5 days'  + TIME '09:00',
   NOW() - INTERVAL '5 days'  + TIME '11:00',
   'completed', 95.00, TRUE, 'fully_paid', 95.00, NULL),
  (7, 12, 23, NULL,
   NOW() - INTERVAL '3 days'  + TIME '09:00',
   NOW() - INTERVAL '3 days'  + TIME '10:30',
   'completed', 70.00, TRUE, 'fully_paid', 70.00, NULL);

-- ============================================================
-- Avis (uniquement sur réservations complétées)
-- ============================================================
INSERT INTO reviews (client_id, pro_id, rating, comment) VALUES
  (5, 3, 5, 'Lucas est un excellent coiffeur, résultat impeccable ! Je recommande.'),
  (6, 2, 4, 'Super prestation, Camille est très professionnelle. Reviendrai bientôt.'),
  (5, 8, 5, 'Inès est incroyable ! Mon baby boomer est parfait, exactement ce que je voulais.'),
  (6, 9, 5, 'Marine est une artiste. Mon nail art est splendide, compliments de partout !'),
  (7, 12, 4, 'Anaïs fait un super travail, ongles impeccables et studio très propre.'),
  -- Avis supplémentaires pour mieux noter les nouvelles pros
  (5, 15, 5, 'Sonia est une perfectionniste, mon french gel est parfait. Je reviens !'),
  (6, 17, 5, 'Baby boomer absolument magnifique, très naturel. Clara est au top !'),
  (7, 16, 4, 'Océane est super sympa et ses nail art sont vraiment tendance.'),
  (5, 19, 4, 'Sofia est douce, professionnelle et son atelier à Montmartre est adorable.'),
  (6, 13, 5, 'Le nail art aquarelle de Pauline est à couper le souffle. Merci !');

-- ============================================================
-- Favoris
-- ============================================================
INSERT INTO favorites (client_id, pro_id) VALUES
  (5, 2),   -- Léa aime Camille
  (5, 4),   -- Léa aime Emma
  (5, 8),   -- Léa aime Inès
  (5, 15),  -- Léa aime Sonia
  (6, 2),   -- Noah aime Camille
  (6, 9),   -- Noah aime Marine
  (7, 3),   -- Jade aime Lucas
  (7, 12);  -- Jade aime Anaïs

-- ============================================================
-- Notifications
-- ============================================================
INSERT INTO notifications (user_id, type, title, message, is_read) VALUES
  (2, 'new_booking',     'Nouvelle réservation', 'Léa Moreau a réservé une prestation pour dans 2 jours.', FALSE),
  (5, 'booking_confirm', 'Réservation confirmée', 'Votre réservation chez Camille Beauty est confirmée.', TRUE),
  (3, 'new_booking',     'Nouvelle réservation', 'Noah Petit a réservé "Coupe homme" pour dans 2 jours.', FALSE),
  (6, 'booking_confirm', 'Réservation confirmée', 'Votre coupe chez Lucas Hair est confirmée.', FALSE);

-- ============================================================
-- Préférences de notifications
-- ============================================================
INSERT INTO client_notification_settings (user_id) VALUES (5), (6), (7);
INSERT INTO pro_notification_settings    (user_id) VALUES (2), (3), (4), (8), (9), (10), (11), (12), (13), (14), (15), (16), (17), (18), (19);

-- ============================================================
-- subscription_plans (idempotent)
-- ============================================================
INSERT INTO subscription_plans (name, monthly_price, annual_price, description, features)
VALUES
  ('start',     29.00, NULL, 'Plan de démarrage — accès aux fonctionnalités essentielles',
    '["Réservations illimitées", "Profil public", "Calendrier", "Notifications"]'::jsonb),
  ('serenite',  59.00, NULL, 'Plan sérénité — fonctionnalités avancées',
    '["Tout Start", "Paiements en ligne", "Instagram", "Statistiques"]'::jsonb),
  ('signature', 99.00, NULL, 'Plan signature — accès complet premium',
    '["Tout Sérénité", "Support prioritaire", "Objectifs financiers", "Export comptable"]'::jsonb)
ON CONFLICT (name) DO NOTHING;
