import os
from pathlib import Path

from flask import Flask, g, send_from_directory

from . import db as db_module
from .utils import csrf_token, load_logged_in_user

BASE_DIR = Path(__file__).resolve().parent.parent

CATEGORIES = ["Travel", "Lifestyle", "Food & Drink", "Culture", "Adventure", "Wellness"]

SITE = {
    "name": "The Voyage Journal",
    "tagline": "Back to the way travel was meant to feel",
    "header_tagline": "A Luxury Travel Feature • Food • Culture",
    "description": (
        "A community journal of travel and lifestyle stories — postcards, "
        "field notes, and slow-travel wisdom, shared by readers like you."
    ),
}


def create_app(test_config=None):
    app = Flask(
        __name__,
        instance_relative_config=True,
        template_folder=str(BASE_DIR / "templates"),
        static_folder=str(BASE_DIR / "static"),
    )
    # DATABASE_PATH / UPLOAD_FOLDER default to living inside the project
    # folder itself, exactly as before — fine for local development, where
    # the whole folder is already persistent. In production (e.g. on
    # Render), set these two env vars to point at a mounted persistent
    # disk instead (see render.yaml), since a plain container filesystem
    # is wiped on every deploy/restart and would otherwise lose the
    # database and every uploaded photo.
    app.config.from_mapping(
        SECRET_KEY=os.environ.get("SECRET_KEY", "dev-secret-change-me-in-production"),
        DATABASE=os.environ.get("DATABASE_PATH", str(BASE_DIR / "voyage_journal.db")),
        UPLOAD_FOLDER=os.environ.get("UPLOAD_FOLDER", str(BASE_DIR / "static" / "uploads")),
        MAX_CONTENT_LENGTH=500 * 1024 * 1024,  # up to 50MB per photo, up to 9 photos per story
        SITE=SITE,
        CATEGORIES=CATEGORIES,
    )

    if test_config:
        app.config.update(test_config)

    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)

    db_module.init_app(app)

    # First boot against a fresh/empty persistent disk: create the schema
    # automatically so the site works right away instead of 500ing with
    # "no such table." Safe to call on every startup — CREATE TABLE IF NOT
    # EXISTS everywhere in schema.sql — so this is a no-op once the DB
    # already exists (including on every later deploy/restart).
    if not Path(app.config["DATABASE"]).exists():
        with app.app_context():
            db_module.init_db()

    from . import auth, blog, admin

    app.register_blueprint(auth.bp)
    app.register_blueprint(blog.bp)
    app.register_blueprint(admin.bp)

    @app.before_request
    def _load_user():
        load_logged_in_user()

    @app.context_processor
    def _inject_globals():
        return {
            "site": SITE,
            "categories": CATEGORIES,
            "current_user": g.get("user"),
            "csrf_token": csrf_token,
        }

    # Serves uploaded photos from UPLOAD_FOLDER (in production, the
    # persistent disk) instead of Flask's normal static-file handling,
    # since UPLOAD_FOLDER may live outside the app's static/ folder. Falls
    # back to the demo/seed images bundled in static/uploads/ (checked
    # into git, always present) if a filename isn't found there — so the
    # seeded demo stories still show their photos even on a brand-new,
    # empty persistent disk.
    @app.route("/uploads/<path:filename>")
    def uploaded_file(filename):
        upload_dir = Path(app.config["UPLOAD_FOLDER"])
        if (upload_dir / filename).is_file():
            return send_from_directory(upload_dir, filename)
        return send_from_directory(Path(app.static_folder) / "uploads", filename)

    @app.errorhandler(404)
    def not_found(e):
        from flask import render_template

        return render_template("404.html"), 404

    return app
