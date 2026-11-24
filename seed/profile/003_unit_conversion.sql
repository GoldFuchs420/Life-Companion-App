-- Seed: Einheits-Umrechnung (FA-331, FA-852)
-- default_g_faktor_ml bewusst NULL: kein Raten von Dichten (FA-334)
INSERT OR IGNORE INTO unit_conversion (einheit, faktor_ml, default_g_faktor_ml) VALUES ('TL',        5,   NULL);
INSERT OR IGNORE INTO unit_conversion (einheit, faktor_ml, default_g_faktor_ml) VALUES ('EL',        15,  NULL);
INSERT OR IGNORE INTO unit_conversion (einheit, faktor_ml, default_g_faktor_ml) VALUES ('prise',     0.5, NULL);
INSERT OR IGNORE INTO unit_conversion (einheit, faktor_ml, default_g_faktor_ml) VALUES ('tasse_150', 150, NULL);
INSERT OR IGNORE INTO unit_conversion (einheit, faktor_ml, default_g_faktor_ml) VALUES ('tasse_250', 250, NULL);
INSERT OR IGNORE INTO unit_conversion (einheit, faktor_ml, default_g_faktor_ml) VALUES ('tasse_330', 330, NULL);
