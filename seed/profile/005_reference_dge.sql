-- Seed: DGE-Referenzwerte (FA-601, FA-852)
-- Altersgruppe 25-51, Werte in der Anzeigeeinheit des jeweiligen Nährstoffs pro TAG.
-- ACHTUNG: Orientierungswerte – verbindliche Pruefung/Verifizierung in M3 (FA-601),
-- fehlende Altersgruppen/Elemente fuehren bewusst zu 'Referenz nicht verfuegbar' (TC-DGE-02, FA-800).
-- Pflichtkern
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 57000  FROM nutrient WHERE name = 'Eiweiß';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 47000   FROM nutrient WHERE name = 'Eiweiß';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 72000  FROM nutrient WHERE name = 'Fett';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 60000   FROM nutrient WHERE name = 'Fett';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 300000 FROM nutrient WHERE name = 'Kohlenhydrate';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 250000  FROM nutrient WHERE name = 'Kohlenhydrate';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 50000  FROM nutrient WHERE name = 'Zucker';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 50000   FROM nutrient WHERE name = 'Zucker';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 30000  FROM nutrient WHERE name = 'Ballaststoffe';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 25000   FROM nutrient WHERE name = 'Ballaststoffe';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 2350   FROM nutrient WHERE name = 'Wasser';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 2000    FROM nutrient WHERE name = 'Wasser';

-- ausgewaehlte Vitamine
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 1100    FROM nutrient WHERE name = 'Vitamin A';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 880      FROM nutrient WHERE name = 'Vitamin A';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 20      FROM nutrient WHERE name = 'Vitamin D';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 20       FROM nutrient WHERE name = 'Vitamin D';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 13000   FROM nutrient WHERE name = 'Vitamin E';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 12000    FROM nutrient WHERE name = 'Vitamin E';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 80      FROM nutrient WHERE name = 'Vitamin K';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 65       FROM nutrient WHERE name = 'Vitamin K';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 110     FROM nutrient WHERE name = 'Vitamin C';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 95       FROM nutrient WHERE name = 'Vitamin C';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 400      FROM nutrient WHERE name = 'Folsäure';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 400     FROM nutrient WHERE name = 'Folsäure';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 4       FROM nutrient WHERE name = 'Vitamin B12';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 4        FROM nutrient WHERE name = 'Vitamin B12';

-- ausgewaehlte Mineralstoffe/Spurenelemente
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 1500   FROM nutrient WHERE name = 'Natrium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 1200    FROM nutrient WHERE name = 'Natrium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 4000   FROM nutrient WHERE name = 'Kalium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 3100    FROM nutrient WHERE name = 'Kalium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 1000   FROM nutrient WHERE name = 'Calcium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 1000    FROM nutrient WHERE name = 'Calcium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 350    FROM nutrient WHERE name = 'Magnesium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 300     FROM nutrient WHERE name = 'Magnesium';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 700    FROM nutrient WHERE name = 'Phosphor';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 700     FROM nutrient WHERE name = 'Phosphor';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 10     FROM nutrient WHERE name = 'Eisen';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 15      FROM nutrient WHERE name = 'Eisen';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 11     FROM nutrient WHERE name = 'Zink';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 8       FROM nutrient WHERE name = 'Zink';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 200    FROM nutrient WHERE name = 'Jod';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 200     FROM nutrient WHERE name = 'Jod';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'maennlich', 70     FROM nutrient WHERE name = 'Selen';
INSERT OR IGNORE INTO reference_dge (nutrient_id, altersgruppe, geschlecht, empfohlen_tag)
  SELECT id, '25-51', 'weiblich', 60      FROM nutrient WHERE name = 'Selen';
