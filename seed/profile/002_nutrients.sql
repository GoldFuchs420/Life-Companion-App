-- Seed: Nährstoff-Katalog (FA-322/323/340, FA-852)
-- einheit = Anzeigeeinheit; normfaktor_nach_µg = mg->1000, µg->1, ml->1 (FA-322)
-- Pflichtkern (stufe='pflicht')
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Eiweiß',        'basis',   'mg', 'pflicht', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Fett',          'basis',   'mg', 'pflicht', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Kohlenhydrate', 'basis',   'mg', 'pflicht', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Zucker',        'basis',   'mg', 'pflicht', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Ballaststoffe', 'basis',   'mg', 'pflicht', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Wasser',        'basis',   'ml', 'pflicht', 1);

-- Vitamine (stufe='empfohlen')
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin A',            'vitamin', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin D',            'vitamin', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin E',            'vitamin', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin K',            'vitamin', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin C',            'vitamin', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin B1',            'vitamin', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin B2',            'vitamin', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin B3',            'vitamin', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin B6',            'vitamin', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Folsäure',              'vitamin', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Vitamin B12',           'vitamin', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Biotin',                'vitamin', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Pantothensäure',       'vitamin', 'mg', 'empfohlen', 1000);

-- Mineralstoffe (stufe='empfohlen')
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Natrium',             'mineral', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Kalium',              'mineral', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Calcium',             'mineral', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Magnesium',            'mineral', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Phosphor',            'mineral', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Chlorid',             'mineral', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Schwefel',            'mineral', 'mg', 'empfohlen', 1000);

-- Spurenelemente (stufe='empfohlen')
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Eisen',               'spurenelement', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Zink',                'spurenelement', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Jod',                 'spurenelement', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Selen',               'spurenelement', 'µg', 'empfohlen', 1);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Kupfer',              'spurenelement', 'mg', 'empfohlen', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Fluor',               'spurenelement', 'mg', 'empfohlen', 1000);

-- Lipide (stufe='optional')
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Fettsäuren gesättigt',        'lipid', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Einfach ungesättigt',         'lipid', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Mehrfach ungesättigt',        'lipid', 'mg', 'optional', 1000);

-- Aminosäuren-Grundset (stufe='optional')
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Lysin',        'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Methionin',    'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Leucin',       'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Isoleucin',    'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Valin',        'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Threonin',     'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Tryptophan',   'aminosaeure', 'mg', 'optional', 1000);
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Phenylalanin', 'aminosaeure', 'mg', 'optional', 1000);

-- Alkohol (stufe='optional', Atwater-Faktor 7 kcal/g)
INSERT OR IGNORE INTO nutrient (name, kategorie, einheit, stufe, normfaktor_nach_µg) VALUES ('Alkohol', 'alkohol', 'mg', 'optional', 1000);
