#!/usr/bin/env python3
"""M1: baut app.db + eine Beispiel-Profil-Datenbank auf und verifiziert sie (FA-850/852/853).

Pruefumfang (TC-DBC):
  - Tabellen-/View-Zahl app.db (4) und Profildatenbank (21 + 1 View)
  - PRAGMA foreign_keys = ON, foreign_key_check ohne Befund
  - Seed-Idempotenz: doppelt eingespielt -> identische Zeilenzahl (FA-852)
  - provider_consent alle mit akzeptiert_am = NULL (FA-507/O-8)
  - kcal-View-Smoke gegen fx-Haferflocken (mit/ohne Ballaststoffe, FA-329/O-2)
  - NAehrstoff-Katalog 44 Eintraege, DGE-Referenz fuer beide Geschlechter

Nutzung:
  python3 tools/init_db.py [--out DIR] [--name NAME] [--keep]
Ablage default: /tmp/lc_db_check (nicht ins Repo!).
"""
import argparse
import re
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

def sorted_sql(folder: Path):
    return sorted(folder.glob("*.sql"))

def apply_files(conn: sqlite3.Connection, files):
    for f in files:
        sql = f.read_text(encoding="utf-8")
        conn.executescript("BEGIN;\n" + sql + "\nCOMMIT;\n")

def set_meta(conn: sqlite3.Connection, schluessel: str, wert: str):
    conn.execute(
        "INSERT INTO db_meta (schluessel, wert) VALUES (?, ?) "
        "ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert",
        (schluessel, wert),
    )

def list_tables(conn, types=("table",)):
    rows = conn.execute(
        "SELECT name, type FROM sqlite_master WHERE type IN (%s) "
        "AND name NOT LIKE 'sqlite_%%' ORDER BY name" % ",".join("'%s'" % t for t in types)
    ).fetchall()
    return rows

def build_app_db(app_dir: Path) -> Path:
    app_path = app_dir / "app.db"
    conn = sqlite3.connect(app_path)
    conn.execute("PRAGMA foreign_keys = ON")
    apply_files(conn, sorted_sql(REPO / "migrations" / "app"))
    apply_files(conn, sorted_sql(REPO / "seed" / "app"))
    set_meta(conn, "schema_version", "0001")
    set_meta(conn, "seed_version", "0001")
    set_meta(conn, "app_version_erstellt", datetime.now(timezone.utc).isoformat(timespec="seconds"))
    conn.commit()
    return app_path

def build_profile_db(app_dir: Path, profile_name: str, args) -> Path:
    uid = str(uuid.uuid4())
    profile_path = app_dir / "profiles" / f"{uid}.db"
    profile_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(profile_path)
    conn.execute("PRAGMA foreign_keys = ON")
    apply_files(conn, sorted_sql(REPO / "migrations" / "profile"))
    apply_files(conn, sorted_sql(REPO / "seed" / "profile"))
    conn.execute("INSERT INTO profile (id, name, geburtsdatum, geschlecht, gewicht_kg, groesse_cm) "
                 "VALUES (?, ?, ?, ?, ?, ?)",
                 (uid, profile_name, args.geburtsdatum, args.geschlecht, args.gewicht, args.groesse))
    set_meta(conn, "schema_version", "0001")
    set_meta(conn, "seed_version", "0001")
    set_meta(conn, "app_version_erstellt", datetime.now(timezone.utc).isoformat(timespec="seconds"))
    conn.commit()

    reg = sqlite3.connect(app_dir / "app.db")
    reg.execute("INSERT INTO profile_registry (id, name, db_datei, erstellt_am) VALUES (?, ?, ?, ?)",
                (uid, profile_name, profile_path.name,
                 datetime.now(timezone.utc).isoformat(timespec="seconds")))
    reg.commit()
    reg.close()
    return profile_path

def counts(conn, table):
    return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

def verify(app_path: Path, profile_path: Path, errors: list):
    app = sqlite3.connect(app_path)
    prof = sqlite3.connect(profile_path)
    for db, label in ((app, "app.db"), (prof, "Profildatenbank")):
        db.execute("PRAGMA foreign_keys = ON")
        fk = db.execute("PRAGMA foreign_key_check").fetchall()
        if fk:
            errors.append(f"{label}: foreign_key_check-Befund: {fk}")

    app_tables = [n for n, t in list_tables(app)]
    prof_tables = [n for n, t in list_tables(prof)]
    prof_views = [n for n, t in list_tables(prof, ("view",))]
    if len(app_tables) != 4:
        errors.append(f"app.db: {len(app_tables)} Tabellen statt 4: {app_tables}")
    if len(prof_tables) != 21:
        errors.append(f"Profildatenbank: {len(prof_tables)} Tabellen statt 21: {prof_tables}")
    if prof_views != ["v_ingredient_kcal_100"]:
        errors.append(f"Profildatenbank: Views {prof_views} statt ['v_ingredient_kcal_100']")

    expected_app = {"db_meta", "profile_registry", "app_settings", "provider_consent"}
    if set(app_tables) != expected_app:
        errors.append(f"app.db: Tabellen {set(app_tables)} != {expected_app}")

    consents = app.execute("SELECT provider, akzeptiert_am FROM provider_consent ORDER BY provider").fetchall()
    if [c[0] for c in consents] != ["fddb", "naehrwertrechner", "openfoodfacts", "rewe", "usda"]:
        errors.append(f"provider_consent Providerset falsch: {consents}")
    if any(c[1] is not None for c in consents):
        errors.append("provider_consent: akzeptiert_am muss initial NULL sein (FA-507/O-8)")

    meta = dict(app.execute("SELECT schluessel, wert FROM db_meta").fetchall())
    for k in ("schema_version", "seed_version", "app_version_erstellt"):
        if k not in meta:
            errors.append(f"app.db: db_meta unvollstaendig ({k} fehlt)")

    n_sel = counts(prof, "nutrient")
    if n_sel != 44:
        errors.append(f"nutrient: {n_sel} Zeilen statt 44")
    for tab, want in [("category", 7), ("unit_conversion", 6), ("shopping_category", 10)]:
        if counts(prof, tab) != want:
            errors.append(f"{tab}: {counts(prof, tab)} Zeilen statt {want}")
    if counts(prof, "reference_dge") == 0:
        errors.append("reference_dge leer (Seed 005)")
    dge_both = prof.execute(
        "SELECT COUNT(DISTINCT geschlecht) FROM reference_dge WHERE altersgruppe = '25-51'"
    ).fetchone()[0]
    if dge_both < 2:
        errors.append("reference_dge: nicht beide Geschlechter vorhanden")

    # Seed-Idempotenz (FA-852): erneutes Einspielen darf Zeilenzahl nicht aendern
    before = {c: counts(prof, c) for c in
              ["category", "nutrient", "unit_conversion", "shopping_category", "reference_dge"]}
    apply_files(prof, sorted_sql(REPO / "seed" / "profile"))
    apply_files(app, sorted_sql(REPO / "seed" / "app"))
    prof.commit(); app.commit()
    for c, want in before.items():
        got = counts(prof, c)
        if got != want:
            errors.append(f"Idempotenz {c}: {want} -> {got} nach zweitem Seed")

    # kcal-View-Smoke (FA-329/O-2): µg-normierte Werte je 100 g
    prof.execute("BEGIN")
    prof.execute(
        "INSERT INTO ingredient (id, name, basis_einheit) VALUES ('fx-haferflocken', 'Haferflocken (Test)', 'g')"
    )
    for name, mg in [("Eiweiß", 13_000_000), ("Kohlenhydrate", 60_000_000),
                     ("Fett", 7_000_000), ("Ballaststoffe", 8_000_000)]:
        prof.execute(
            "INSERT INTO ingredient_nutrient (ingredient_id, nutrient_id, wert_normiert_pro_100) "
            "VALUES ('fx-haferflocken', (SELECT id FROM nutrient WHERE name = ?), ?)", (name, mg)
        )
    kcal = prof.execute("SELECT kcal_pro_100 FROM v_ingredient_kcal_100 WHERE ingredient_id = 'fx-haferflocken'").fetchone()[0]
    if abs(kcal - 371.0) > 0.05:
        errors.append(f"kcal-View: fx-Haferflocken (mit Ballaststoffen) {kcal} statt 371.0")
    prof.execute(
        "DELETE FROM ingredient_nutrient WHERE ingredient_id = 'fx-haferflocken' "
        "AND nutrient_id = (SELECT id FROM nutrient WHERE name = 'Ballaststoffe')"
    )
    kcal_ohne = prof.execute("SELECT kcal_pro_100 FROM v_ingredient_kcal_100 WHERE ingredient_id = 'fx-haferflocken'").fetchone()[0]
    if abs(kcal_ohne - 355.0) > 0.05:
        errors.append(f"kcal-View: fx-Haferflocken (ohne Ballaststoffe) {kcal_ohne} statt 355.0")
    prof.rollback()

    print(f"app.db: {len(app_tables)} Tabellen | profile: {len(prof_tables)} Tabellen + {len(prof_views)} View")
    print(f"Seeds: nutrient={n_sel}, category={counts(prof, 'category')}, unit_conversion={counts(prof, 'unit_conversion')}, "
          f"shopping_category={counts(prof, 'shopping_category')}, reference_dge={counts(prof, 'reference_dge')}")
    print(f"kcal-View: mit Ballaststoffen {kcal} kcal / ohne {kcal_ohne} kcal (fx-Haferflocken)")
    app.close()
    prof.close()

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="/tmp/lc_db_check")
    ap.add_argument("--name", default="Testprofil")
    ap.add_argument("--geburtsdatum", default="1990-01-01")
    ap.add_argument("--geschlecht", default="divers", choices=["maennlich", "weiblich", "divers"])
    ap.add_argument("--gewicht", type=float, default=70.0)
    ap.add_argument("--groesse", type=float, default=170.0)
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()

    out = Path(args.out)
    if out.exists() and not args.keep:
        import shutil
        shutil.rmtree(out)
    out.mkdir(parents=True, exist_ok=True)

    errors = []
    app_path = build_app_db(out)
    profile_path = build_profile_db(out, args.name, args)
    verify(app_path, profile_path, errors)

    if errors:
        print("\nFEHLER:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print(f"OK – app.db + 1 Profildatenbank in {out}")

if __name__ == "__main__":
    main()
