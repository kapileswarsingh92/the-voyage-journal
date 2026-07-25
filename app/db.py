import sqlite3
from pathlib import Path

import click
from flask import current_app, g

SCHEMA_PATH = Path(__file__).resolve().parent.parent / "schema.sql"


def get_db():
    """Return a SQLite connection for the current request, creating one if needed."""
    if "db" not in g:
        g.db = sqlite3.connect(
            current_app.config["DATABASE"],
            detect_types=sqlite3.PARSE_DECLTYPES,
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    with open(SCHEMA_PATH, "r") as f:
        db.executescript(f.read())


def ensure_post_pdfs_table():
    """Additive migration for the post_pdfs table (PDF attachments) —
    CREATE TABLE/INDEX IF NOT EXISTS, so it's cheap and safe to call on
    every startup, including against an already-existing production
    database with real data in it. This is different from init_db() above,
    which drops and recreates every table and — per create_app() — only
    ever runs once, against a brand-new empty database. A schema change
    that needs to reach a database that already exists has to go through
    a step like this one instead."""
    db = get_db()
    db.execute(
        """CREATE TABLE IF NOT EXISTS post_pdfs (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id           INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            filename          TEXT NOT NULL,
            original_filename TEXT NOT NULL,
            position          INTEGER NOT NULL DEFAULT 0,
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )"""
    )
    db.execute("CREATE INDEX IF NOT EXISTS idx_post_pdfs_post ON post_pdfs(post_id, position)")
    db.commit()


@click.command("init-db")
def init_db_command():
    """Drop and recreate all tables."""
    init_db()
    click.echo("Initialized the database.")


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)
