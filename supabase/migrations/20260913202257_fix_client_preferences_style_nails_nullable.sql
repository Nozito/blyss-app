-- client_preferences.style_nails avait une contrainte NOT NULL héritée d'avant
-- le passage multi-style (#34 passe 3b, colonne `styles`). Depuis la
-- décision "ville OU styles" (une préférence enregistrée avec une ville
-- seule, sans aucun style choisi), l'INSERT envoie explicitement NULL pour
-- style_nails — bloqué en base malgré une validation applicative correcte.
-- style_nails reste utile en lecture (rétro-compat, = styles[0]), mais n'a
-- plus de raison d'être obligatoire.
ALTER TABLE client_preferences ALTER COLUMN style_nails DROP NOT NULL;
