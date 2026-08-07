-- ============================================================
-- Seed pro "Sophie" — Blyss App
-- Crée une pro dédiée (Sophie Caron) avec un historique complet de
-- clientes, réservations, paiements, avis et créneaux du 01/01/2026
-- au 30/09/2026 (passé + jours à venir), pour que les écrans PRO
-- (dashboard, planning, clients, finance, services) soient pleins
-- pour des captures d'écran.
-- Additif : ne touche à aucune donnée existante.
-- À coller/exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

DO $$
DECLARE
  today       date := CURRENT_DATE;                -- 2026-08-04
  range_start date := '2026-01-01';
  range_end   date := '2026-09-30';
  pro_hash    text := '$2b$10$F/oBeuZNnI7X8qsALKvExeTaDz3VGePh9n1KWYLBU0FsYNnR.hn/e'; -- Pro123!
  client_hash text := '$2b$10$x74hPnmh2i9m4NHEAG71kO/RKapZhrtxTsOfkjF/6YnpeXUOPpVxy'; -- Client123!

  sophie_id int;

  first_f text[] := ARRAY['Manon','Camille','Louise','Alice','Julia','Zoe','Emma','Louna','Nina','Rose','Lena','Mila','Inaya','Anna','Elena','Juliette','Agathe','Margot','Elea','Romane','Lina','Salome','Celia','Maelys','Iris','Victoria','Amandine','Coralie','Justine','Chloe'];
  first_m text[] := ARRAY['Leo','Gabriel','Raphael','Arthur','Louis','Adam','Jules','Hugo','Ethan','Nathan','Sacha','Tom','Mathis','Enzo','Theo'];
  last_names text[] := ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Roux','Vincent','Fournier','Morel','Girard','Andre','Lefevre','Mercier','Dupont','Lambert','Bonnet','Francois','Martinez','Legrand','Garnier','Faure','Rousseau','Blanc','Guerin','Muller','Henry','Roussel','Nicolas','Perrot','Chevalier','Gauthier','Masson','Renaud','Marchand'];

  prestation_names text[]     := ARRAY['Manucure classique','Semi-permanent','Pose gel couleur','Nail art creatif','Baby boomer','Remplissage gel','French manucure'];
  prestation_prices numeric[] := ARRAY[35,       48,              65,               85,                75,           45,               50];
  prestation_durations int[]  := ARRAY[45,       60,              75,               90,                90,           60,               60];
  prestation_weights int[]    := ARRAY[2,        4,               4,                2,                 2,            3,                2]; -- pondération de popularité

  preferred_shapes text[] := ARRAY['round','square','oval','almond','coffin','stiletto','squoval'];
  allergies_pool   text[] := ARRAY[NULL, NULL, NULL, 'Allergie a l''acetone', 'Peau sensible aux UV', 'Allergie au latex', NULL];
  review_comments  text[] := ARRAY['Sophie est incroyable, un vrai savoir-faire !','Studio impeccable, tres pro, je recommande.','Toujours un plaisir, resultat parfait a chaque fois.','Ponctuelle, minutieuse, exactement ce qu''il me fallait.','Ambiance chaleureuse et travail soigne.','Un peu chere mais la qualite est au rendez-vous.','Parfait, je reviendrai sans hesiter !','Excellent accueil, tres satisfaite du resultat.'];

  i int;
  n int;
  cur_id int;
  first_name text;
  last_name text;
  email text;
  created_at timestamptz;
  birth date;

  client_ids int[] := '{}';
  regular_ids int[] := '{}';
  weighted_pool int[] := '{}';

  prestation_ids int[];
  prestation_id_by_idx int[];

  d date;
  dow int;
  day_count int;
  hour_v int;
  minute_v int;
  pres_idx int;
  chosen_prestation_id int;
  chosen_price numeric;
  chosen_duration int;
  client_id_var int;
  start_dt timestamptz;
  end_dt timestamptz;
  slot_id_var int;
  status_v text;
  paid_online_v boolean;
  payment_status_v text;
  total_paid_v numeric;
  deposit_amount_v numeric;
  res_id int;
  pay_status_v text;
  is_future boolean;
  is_today boolean;

  extra_slots int;
  slot_hour int;
BEGIN
  -- ── 1. Compte pro "Sophie" ────────────────────────────────────────────────
  INSERT INTO users (
    first_name, last_name, email, password_hash, phone_number, birth_date,
    role, is_admin, pro_status, activity_name, city, bio, specialty,
    latitude, longitude, geo_precision, profile_visibility, accept_online_payment,
    is_active, monthly_objective, deposit_percentage, created_at
  ) VALUES (
    'Sophie', 'Caron', 'sophie.pro@blyss.dev', pro_hash, '0611223344', '1991-05-14',
    'pro', FALSE, 'active', 'Sophie Nails Paris', 'Paris',
    'Prothesiste ongulaire passionnee depuis 8 ans. Specialiste semi-permanent, pose de gel et nail art sur-mesure. Studio cosy dans le 9e arrondissement.',
    'Semi-permanent & nail art',
    48.8759, 2.3389, 'address', 'public', TRUE,
    TRUE, 4000, 50, '2026-01-01 09:00:00+01'
  )
  RETURNING id INTO sophie_id;

  UPDATE users SET public_latitude = latitude + (((id % 41)-20)/20.0)*0.008, public_longitude = longitude + (((id % 37)-18)/18.0)*0.008
  WHERE id = sophie_id;

  INSERT INTO pro_notification_settings (user_id) VALUES (sophie_id) ON CONFLICT DO NOTHING;

  -- ── 2. Abonnement actif "signature" (requis par /pro/finance/stats) ───────
  INSERT INTO subscriptions (client_id, plan, billing_type, monthly_price, start_date, status, payment_id, created_at)
  VALUES (sophie_id, 'signature', 'monthly', 99.00, '2026-01-01', 'active', 'sub_seed_sophie', '2026-01-01');

  -- ── 3. Prestations de Sophie ────────────────────────────────────────────
  prestation_ids := '{}';
  FOR i IN 1..array_length(prestation_names,1) LOOP
    INSERT INTO prestations (pro_id, name, description, price, duration_minutes, active, recall_weeks, buffer_after_minutes)
    VALUES (sophie_id, prestation_names[i], 'Prestation realisee avec soin, produits haut de gamme.', prestation_prices[i], prestation_durations[i], TRUE, 3, 10)
    RETURNING id INTO cur_id;
    prestation_ids := prestation_ids || cur_id;
  END LOOP;

  -- ── 4. Clientele dediee (45 clientes, dont ~12 regulieres) ────────────────
  FOR i IN 1..45 LOOP
    IF random() < 0.7 THEN
      first_name := first_f[1 + floor(random()*array_length(first_f,1))::int];
    ELSE
      first_name := first_m[1 + floor(random()*array_length(first_m,1))::int];
    END IF;
    last_name := last_names[1 + floor(random()*array_length(last_names,1))::int];
    email := regexp_replace(lower(first_name),'[^a-z]','','g') || '.' || regexp_replace(lower(last_name),'[^a-z]','','g') || 'c' || i::text || '@blyss.dev';
    created_at := range_start + (random() * (LEAST(now()::date, range_end) - range_start)) * INTERVAL '1 day';
    birth := make_date(1978+floor(random()*28)::int, 1+floor(random()*12)::int, 1+floor(random()*28)::int);
    INSERT INTO users (first_name,last_name,email,password_hash,phone_number,birth_date,role,is_admin,city,profile_visibility,accept_online_payment,is_active,created_at)
    VALUES (first_name,last_name,email,client_hash,'06'||(10000000+floor(random()*89999999))::bigint::text,birth,'client',FALSE,'Paris','public',FALSE,TRUE,created_at)
    RETURNING id INTO cur_id;
    client_ids := client_ids || cur_id;
    INSERT INTO client_notification_settings(user_id) VALUES (cur_id) ON CONFLICT DO NOTHING;
    IF i <= 12 THEN
      regular_ids := regular_ids || cur_id;
    END IF;
  END LOOP;

  -- Pool pondere : les regulieres reviennent bien plus souvent
  FOREACH cur_id IN ARRAY client_ids LOOP
    IF cur_id = ANY(regular_ids) THEN
      FOR i IN 1..7 LOOP weighted_pool := weighted_pool || cur_id; END LOOP;
    ELSE
      weighted_pool := weighted_pool || cur_id;
    END IF;
  END LOOP;

  -- ── 5. Réservations + créneaux + paiements + avis, jour par jour ─────────
  d := range_start;
  WHILE d <= range_end LOOP
    dow := extract(dow FROM d)::int; -- 0=dimanche
    is_future := d > today;
    is_today := d = today;

    IF dow = 0 THEN
      day_count := 0; -- fermé le dimanche
    ELSIF dow = 1 THEN
      day_count := 1 + floor(random()*3)::int;      -- lundi : 1-3
    ELSIF dow IN (5,6) THEN
      day_count := 5 + floor(random()*3)::int;       -- ven/sam : 5-7
    ELSE
      day_count := 3 + floor(random()*3)::int;        -- mar-jeu : 3-5
    END IF;
    IF is_today THEN day_count := GREATEST(day_count, 4); END IF;

    FOR i IN 1..day_count LOOP
      pres_idx := 1 + floor(random()*array_length(prestation_ids,1))::int;
      chosen_prestation_id := prestation_ids[pres_idx];
      chosen_price := prestation_prices[pres_idx];
      chosen_duration := prestation_durations[pres_idx];
      client_id_var := weighted_pool[1+floor(random()*array_length(weighted_pool,1))::int];

      hour_v := 9 + floor(random()*8)::int; -- 9h-16h
      minute_v := (ARRAY[0,15,30,45])[1+floor(random()*4)::int];
      start_dt := d + (hour_v::text || ' hours')::interval + (minute_v::text || ' minutes')::interval;
      end_dt := start_dt + (chosen_duration::text || ' minutes')::interval;

      IF is_future THEN
        status_v := CASE WHEN random() < 0.75 THEN 'confirmed' ELSE 'pending' END;
      ELSE
        status_v := CASE WHEN random() < 0.82 THEN 'completed' WHEN random() < 0.93 THEN 'cancelled' ELSE 'confirmed' END;
      END IF;

      INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
      VALUES (sophie_id, start_dt, end_dt, chosen_duration, CASE WHEN status_v = 'cancelled' THEN 'available' ELSE 'booked' END)
      RETURNING id INTO slot_id_var;

      paid_online_v := random() < 0.6;
      IF status_v = 'cancelled' THEN
        payment_status_v := 'unpaid'; total_paid_v := 0; deposit_amount_v := NULL;
      ELSIF paid_online_v THEN
        IF random() < 0.65 THEN
          payment_status_v := 'fully_paid'; total_paid_v := chosen_price; deposit_amount_v := NULL;
        ELSE
          payment_status_v := 'deposit_paid'; total_paid_v := round(chosen_price*0.5,2); deposit_amount_v := total_paid_v;
        END IF;
      ELSE
        IF status_v = 'completed' THEN
          payment_status_v := 'paid_on_site'; total_paid_v := chosen_price;
        ELSE
          payment_status_v := 'unpaid'; total_paid_v := 0;
        END IF;
        deposit_amount_v := NULL;
      END IF;

      INSERT INTO reservations (client_id,pro_id,prestation_id,slot_id,start_datetime,end_datetime,status,price,paid_online,payment_status,total_paid,deposit_amount,created_at)
      VALUES (client_id_var, sophie_id, chosen_prestation_id, slot_id_var, start_dt, end_dt, status_v, chosen_price, paid_online_v, payment_status_v, total_paid_v, deposit_amount_v, LEAST(start_dt - ((1+floor(random()*6))::text||' days')::interval, now()))
      RETURNING id INTO res_id;

      IF paid_online_v AND total_paid_v > 0 THEN
        pay_status_v := CASE WHEN random() < 0.9 THEN 'succeeded' WHEN random() < 0.95 THEN 'pending' WHEN random() < 0.98 THEN 'refunded' ELSE 'failed' END;
        INSERT INTO payments (reservation_id,client_id,pro_id,type,amount,stripe_payment_intent_id,status,created_at)
        VALUES (res_id, client_id_var, sophie_id, CASE WHEN deposit_amount_v IS NOT NULL THEN 'deposit' ELSE 'full' END, total_paid_v, 'pi_seed_sophie_'||res_id::text||'_'||substr(md5(random()::text),1,8), pay_status_v, start_dt);
      END IF;

      IF status_v = 'completed' AND random() < 0.55 THEN
        INSERT INTO reviews (client_id,pro_id,rating,comment)
        VALUES (client_id_var, sophie_id,
          CASE WHEN random() < 0.6 THEN 5 WHEN random() < 0.88 THEN 4 WHEN random() < 0.97 THEN 3 ELSE 2 END,
          review_comments[1+floor(random()*array_length(review_comments,1))::int]
        ) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- Créneaux disponibles supplémentaires (non réservés) sur les 45 prochains jours
    IF is_future AND d <= today + 45 AND dow <> 0 THEN
      extra_slots := 1 + floor(random()*4)::int;
      FOR i IN 1..extra_slots LOOP
        slot_hour := 9 + floor(random()*8)::int;
        INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
        VALUES (sophie_id, d + (slot_hour::text||' hours')::interval, d + (slot_hour::text||' hours')::interval + INTERVAL '60 minutes', 60, 'available');
      END LOOP;
      IF random() < 0.12 THEN
        INSERT INTO slots (pro_id, start_datetime, end_datetime, duration, status)
        VALUES (sophie_id, d + INTERVAL '12 hours 30 minutes', d + INTERVAL '13 hours 30 minutes', 60, 'blocked');
      END IF;
    END IF;

    d := d + 1;
  END LOOP;

  -- ── 6. Fiches clientes enrichies pour les régulières ─────────────────────
  FOREACH cur_id IN ARRAY regular_ids LOOP
    INSERT INTO pro_client_notes (pro_id, client_id, notes, allergies, preferred_shape, preferred_style, patch_test_done, patch_test_date)
    VALUES (
      sophie_id, cur_id,
      'Cliente fidele, tres agreable. Prefere les rendez-vous en debut de semaine.',
      allergies_pool[1+floor(random()*array_length(allergies_pool,1))::int],
      preferred_shapes[1+floor(random()*array_length(preferred_shapes,1))::int],
      (ARRAY['Nude & discret','Couleurs vives','Nail art delicat','Baby boomer classique','French moderne'])[1+floor(random()*5)::int],
      random() < 0.6,
      CASE WHEN random() < 0.6 THEN (range_start + floor(random()*60)::int) ELSE NULL END
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  -- Une cliente bloquée, pour illustrer l'onglet blocage
  INSERT INTO blocked_clients (pro_id, client_id, reason)
  VALUES (sophie_id, client_ids[array_length(client_ids,1)], 'Plusieurs rendez-vous manques sans prevenir.')
  ON CONFLICT DO NOTHING;

  -- ── 7. Favoris ────────────────────────────────────────────────────────────
  FOR i IN 1..20 LOOP
    client_id_var := client_ids[1+floor(random()*array_length(client_ids,1))::int];
    INSERT INTO favorites (client_id, pro_id) VALUES (client_id_var, sophie_id) ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seed Sophie (pro) termine : id=%, % clientes, % prestations.', sophie_id, array_length(client_ids,1), array_length(prestation_ids,1);
END $$;
