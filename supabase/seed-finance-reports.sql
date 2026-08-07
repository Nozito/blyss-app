-- ============================================================
-- Seed de rapports financiers passés pour Sophie (sophie.pro@blyss.dev).
-- Remplit finance_reports avec les 6 dernières semaines complètes et
-- les 3 derniers mois complets, calculés depuis ses vraies réservations
-- seedées (seed-sophie-pro.sql), pour tester l'écran "Rapports
-- automatiques" sans attendre le prochain lundi / 1er du mois.
-- Additif, idempotent (ON CONFLICT DO NOTHING) — ne touche à aucune
-- donnée existante.
-- À coller/exécuter dans le SQL Editor du dashboard Supabase.
-- ============================================================

DO $$
DECLARE
  sophie_id     int;
  today         date := CURRENT_DATE;
  this_monday   date := CURRENT_DATE - (((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7));

  wk_start date; wk_end date; prev_wk_start date; prev_wk_end date;
  mo_start date; mo_end date; prev_mo_start date; prev_mo_end date;

  rev numeric; cnt int; prev_rev numeric; avgb numeric; top jsonb;
  i int;
BEGIN
  SELECT id INTO sophie_id FROM users WHERE email = 'sophie.pro@blyss.dev';
  IF sophie_id IS NULL THEN
    RAISE NOTICE 'Sophie (sophie.pro@blyss.dev) introuvable — lance seed-sophie-pro.sql d''abord.';
    RETURN;
  END IF;

  -- ── Rapports hebdomadaires — 6 dernières semaines complètes (lundi→dimanche) ──
  FOR i IN 1..6 LOOP
    wk_start := this_monday - (i * 7);
    wk_end   := wk_start + 6;
    prev_wk_start := wk_start - 7;
    prev_wk_end   := wk_end - 7;

    SELECT COALESCE(SUM(price), 0), COUNT(*) INTO rev, cnt
    FROM reservations
    WHERE pro_id = sophie_id AND start_datetime::date BETWEEN wk_start AND wk_end
      AND status IN ('confirmed', 'completed');

    IF cnt = 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(price), 0) INTO prev_rev
    FROM reservations
    WHERE pro_id = sophie_id AND start_datetime::date BETWEEN prev_wk_start AND prev_wk_end
      AND status IN ('confirmed', 'completed');

    avgb := ROUND(rev / cnt, 2);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', name, 'revenue', revenue, 'count', svc_count,
             'percentage', CASE WHEN total_rev > 0 THEN ROUND((revenue / total_rev) * 100, 1) ELSE 0 END
           ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO top
    FROM (
      SELECT COALESCE(p.name, 'Prestation') AS name, SUM(r.price) AS revenue, COUNT(*) AS svc_count,
             SUM(SUM(r.price)) OVER () AS total_rev
      FROM reservations r
      LEFT JOIN prestations p ON p.id = r.prestation_id
      WHERE r.pro_id = sophie_id AND r.start_datetime::date BETWEEN wk_start AND wk_end
        AND r.status IN ('confirmed', 'completed')
      GROUP BY COALESCE(p.name, 'Prestation')
      ORDER BY revenue DESC
      LIMIT 5
    ) t;

    INSERT INTO finance_reports (pro_id, period_type, period_start, period_end, revenue, previous_revenue, bookings_count, avg_basket, top_services, viewed_at)
    VALUES (sophie_id, 'week', wk_start, wk_end, rev, prev_rev, cnt, avgb, top, CASE WHEN i = 1 THEN NULL ELSE NOW() END)
    ON CONFLICT (pro_id, period_type, period_start) DO NOTHING;
  END LOOP;

  -- ── Rapports mensuels — 3 derniers mois complets ──
  FOR i IN 1..3 LOOP
    mo_start := (date_trunc('month', today) - (i || ' months')::interval)::date;
    mo_end   := (date_trunc('month', today) - ((i - 1) || ' months')::interval - interval '1 day')::date;
    prev_mo_start := (date_trunc('month', mo_start) - interval '1 month')::date;
    prev_mo_end   := (mo_start - interval '1 day')::date;

    SELECT COALESCE(SUM(price), 0), COUNT(*) INTO rev, cnt
    FROM reservations
    WHERE pro_id = sophie_id AND start_datetime::date BETWEEN mo_start AND mo_end
      AND status IN ('confirmed', 'completed');

    IF cnt = 0 THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(price), 0) INTO prev_rev
    FROM reservations
    WHERE pro_id = sophie_id AND start_datetime::date BETWEEN prev_mo_start AND prev_mo_end
      AND status IN ('confirmed', 'completed');

    avgb := ROUND(rev / cnt, 2);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', name, 'revenue', revenue, 'count', svc_count,
             'percentage', CASE WHEN total_rev > 0 THEN ROUND((revenue / total_rev) * 100, 1) ELSE 0 END
           ) ORDER BY revenue DESC), '[]'::jsonb)
    INTO top
    FROM (
      SELECT COALESCE(p.name, 'Prestation') AS name, SUM(r.price) AS revenue, COUNT(*) AS svc_count,
             SUM(SUM(r.price)) OVER () AS total_rev
      FROM reservations r
      LEFT JOIN prestations p ON p.id = r.prestation_id
      WHERE r.pro_id = sophie_id AND r.start_datetime::date BETWEEN mo_start AND mo_end
        AND r.status IN ('confirmed', 'completed')
      GROUP BY COALESCE(p.name, 'Prestation')
      ORDER BY revenue DESC
      LIMIT 5
    ) t;

    INSERT INTO finance_reports (pro_id, period_type, period_start, period_end, revenue, previous_revenue, bookings_count, avg_basket, top_services, viewed_at)
    VALUES (sophie_id, 'month', mo_start, mo_end, rev, prev_rev, cnt, avgb, top, NOW())
    ON CONFLICT (pro_id, period_type, period_start) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Finance reports seeded for pro id %', sophie_id;
END $$;
