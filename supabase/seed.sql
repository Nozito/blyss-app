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
-- pro x3  → Pro123!
-- client x3 → Client123!
-- ============================================================
INSERT INTO users (
  first_name, last_name, email, password_hash, phone_number, birth_date,
  role, is_admin, pro_status, activity_name, city, bio,
  profile_visibility, accept_online_payment, is_active
) VALUES
  -- Admin
  ('Sophie',   'Martin',   'admin@blyss.dev',     '$2b$10$1E1dIvgKCDVo3uSCVh7Jj.ljyXkJbRNb5tXUP6yOwFn0MQx.KvgE6', '0601010101', '1988-04-12', 'admin',  TRUE,  'active',   NULL,             'Paris',    NULL,                                                 'public',  FALSE, TRUE),
  -- Pros
  ('Camille',  'Dubois',   'camille@blyss.dev',   '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e', '0612121212', '1990-07-22', 'pro',    FALSE, 'active',   'Camille Beauty', 'Paris',    'Spécialiste en soins du visage & massage relaxant.',  'public',  TRUE,  TRUE),
  ('Lucas',    'Bernard',  'lucas@blyss.dev',     '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e', '0623232323', '1985-03-15', 'pro',    FALSE, 'active',   'Lucas Hair',     'Lyon',     'Coiffeur expert — coupes modernes & colorations.',   'public',  TRUE,  TRUE),
  ('Emma',     'Leroy',    'emma@blyss.dev',      '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e', '0634343434', '1993-11-08', 'pro',    FALSE, 'active',   'Emma Nail Art',  'Bordeaux', 'Nail art & manucure haut de gamme.',                 'public',  FALSE, TRUE),
  -- Clients
  ('Léa',      'Moreau',   'lea@blyss.dev',       '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy', '0645454545', '1997-09-01', 'client', FALSE, NULL,       NULL,             'Paris',    NULL,                                                 'public',  FALSE, TRUE),
  ('Noah',     'Petit',    'noah@blyss.dev',       '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy', '0656565656', '1995-06-18', 'client', FALSE, NULL,       NULL,             'Lyon',     NULL,                                                 'public',  FALSE, TRUE),
  ('Jade',     'Simon',    'jade@blyss.dev',      '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy', '0667676767', '2000-01-25', 'client', FALSE, NULL,       NULL,             'Bordeaux', NULL,                                                 'public',  FALSE, TRUE);

-- IDs attendus : admin=1, camille=2, lucas=3, emma=4, lea=5, noah=6, jade=7

-- ============================================================
-- Prestations (Camille = 2, Lucas = 3, Emma = 4)
-- ============================================================
INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active) VALUES
  -- Camille
  (2, 'Soin visage éclat',          'Nettoyage profond + masque hydratant.',         65.00, 60,  TRUE),
  (2, 'Massage relaxant 60 min',    'Massage dos & épaules aux huiles essentielles.', 80.00, 60,  TRUE),
  (2, 'Massage relaxant 90 min',    'Corps entier, profondément ressourçant.',        110.00, 90, TRUE),
  -- Lucas
  (3, 'Coupe femme',                'Coupe + brushing sur cheveux secs.',             55.00, 60,  TRUE),
  (3, 'Coupe homme',                'Coupe + finition rasoir.',                       35.00, 45,  TRUE),
  (3, 'Coloration complète',        'Couleur + soin + brushing.',                     95.00, 120, TRUE),
  -- Emma
  (4, 'Manucure classique',         'Lime + base + vernis couleur.',                  35.00, 45,  TRUE),
  (4, 'Pose gel full cover',        'Pose de gel couleur + nail art simple.',         60.00, 75,  TRUE),
  (4, 'Nail art créatif',           'Design personnalisé sur demande.',               80.00, 90,  TRUE);

-- ============================================================
-- Slots (futures dates — relatif à NOW())
-- ============================================================
INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status) VALUES
  -- Camille (pro_id=2) — cette semaine
  (2, NOW() + INTERVAL '1 day'  + TIME '09:00', NOW() + INTERVAL '1 day'  + TIME '10:00', 60, 'available'),
  (2, NOW() + INTERVAL '1 day'  + TIME '10:30', NOW() + INTERVAL '1 day'  + TIME '11:30', 60, 'available'),
  (2, NOW() + INTERVAL '2 days' + TIME '14:00', NOW() + INTERVAL '2 days' + TIME '15:30', 90, 'booked'),
  (2, NOW() + INTERVAL '3 days' + TIME '11:00', NOW() + INTERVAL '3 days' + TIME '12:00', 60, 'available'),
  (2, NOW() + INTERVAL '5 days' + TIME '09:00', NOW() + INTERVAL '5 days' + TIME '10:00', 60, 'available'),
  -- Lucas (pro_id=3)
  (3, NOW() + INTERVAL '1 day'  + TIME '10:00', NOW() + INTERVAL '1 day'  + TIME '10:45', 45, 'available'),
  (3, NOW() + INTERVAL '1 day'  + TIME '11:00', NOW() + INTERVAL '1 day'  + TIME '13:00', 120,'available'),
  (3, NOW() + INTERVAL '2 days' + TIME '15:00', NOW() + INTERVAL '2 days' + TIME '15:45', 45, 'booked'),
  (3, NOW() + INTERVAL '4 days' + TIME '09:30', NOW() + INTERVAL '4 days' + TIME '10:15', 45, 'available'),
  -- Emma (pro_id=4)
  (4, NOW() + INTERVAL '1 day'  + TIME '13:00', NOW() + INTERVAL '1 day'  + TIME '13:45', 45, 'available'),
  (4, NOW() + INTERVAL '2 days' + TIME '10:00', NOW() + INTERVAL '2 days' + TIME '11:15', 75, 'available'),
  (4, NOW() + INTERVAL '3 days' + TIME '14:00', NOW() + INTERVAL '3 days' + TIME '15:30', 90, 'booked');

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
   'confirmed', 110.00, TRUE, 'deposit_paid', 55.00, 55.00),
  -- Noah (6) chez Lucas (3) — slot 8 (booked)
  (6, 3, 5, 8,
   NOW() + INTERVAL '2 days' + TIME '15:00',
   NOW() + INTERVAL '2 days' + TIME '15:45',
   'confirmed', 35.00, FALSE, 'paid_on_site', 0.00, NULL),
  -- Jade (7) chez Emma (4) — slot 12 (booked)
  (7, 4, 7, 12,
   NOW() + INTERVAL '3 days' + TIME '14:00',
   NOW() + INTERVAL '3 days' + TIME '15:30',
   'confirmed', 80.00, TRUE, 'fully_paid', 80.00, NULL),
  -- Réservation passée (complétée) — Léa chez Lucas
  (5, 3, 4, NULL,
   NOW() - INTERVAL '7 days' + TIME '10:00',
   NOW() - INTERVAL '7 days' + TIME '11:00',
   'completed', 55.00, FALSE, 'paid_on_site', 55.00, NULL),
  -- Réservation passée (complétée) — Noah chez Camille
  (6, 2, 1, NULL,
   NOW() - INTERVAL '14 days' + TIME '09:00',
   NOW() - INTERVAL '14 days' + TIME '10:00',
   'completed', 65.00, TRUE, 'fully_paid', 65.00, NULL);

-- ============================================================
-- Avis (uniquement sur les réservations complétées)
-- ============================================================
INSERT INTO reviews (client_id, pro_id, rating, comment) VALUES
  (5, 3, 5, 'Lucas est un excellent coiffeur, résultat impeccable ! Je recommande.'),
  (6, 2, 4, 'Super prestation, Camille est très professionnelle. Reviendrai bientôt.');

-- ============================================================
-- Favoris
-- ============================================================
INSERT INTO favorites (client_id, pro_id) VALUES
  (5, 2),   -- Léa aime Camille
  (5, 4),   -- Léa aime Emma
  (6, 2),   -- Noah aime Camille
  (7, 3);   -- Jade aime Lucas

-- ============================================================
-- Notifications (quelques exemples)
-- ============================================================
INSERT INTO notifications (user_id, type, title, message, is_read) VALUES
  (2, 'new_booking',     'Nouvelle réservation',    'Léa Moreau a réservé "Massage relaxant 90 min" pour dans 2 jours.', FALSE),
  (5, 'booking_confirm', 'Réservation confirmée',   'Votre massage chez Camille Beauty est confirmé.', TRUE),
  (3, 'new_booking',     'Nouvelle réservation',    'Noah Petit a réservé "Coupe homme" pour dans 2 jours.', FALSE),
  (6, 'booking_confirm', 'Réservation confirmée',   'Votre coupe chez Lucas Hair est confirmée.', FALSE);

-- ============================================================
-- Préférences de notifications (auto-créées à l'inscription)
-- ============================================================
INSERT INTO client_notification_settings (user_id) VALUES (5), (6), (7);
INSERT INTO pro_notification_settings    (user_id) VALUES (2), (3), (4);

-- ============================================================
-- subscription_plans est déjà seedé par la migration 001
-- (un INSERT idempotent par sécurité)
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
