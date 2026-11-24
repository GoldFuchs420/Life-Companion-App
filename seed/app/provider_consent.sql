-- Seed: provider_consent (FA-507, O-8) – jeder Provider nur nach einmaliger
-- Einwilligungs-Zeile kontaktierbar; Vorgabe: akzeptiert_am = NULL.
INSERT OR IGNORE INTO provider_consent (provider, akzeptiert_am) VALUES ('openfoodfacts',    NULL);
INSERT OR IGNORE INTO provider_consent (provider, akzeptiert_am) VALUES ('usda',             NULL);
INSERT OR IGNORE INTO provider_consent (provider, akzeptiert_am) VALUES ('naehrwertrechner', NULL);
INSERT OR IGNORE INTO provider_consent (provider, akzeptiert_am) VALUES ('fddb',             NULL);
INSERT OR IGNORE INTO provider_consent (provider, akzeptiert_am) VALUES ('rewe',             NULL);
