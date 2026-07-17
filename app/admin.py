from pathlib import Path

from flask import Blueprint, abort, current_app, flash, redirect, render_template, request, url_for

from .db import get_db
from .utils import admin_required, validate_csrf

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.route("/")
@admin_required
def dashboard():
    db = get_db()
    pending = db.execute(
        "SELECT * FROM posts WHERE status = 'pending' ORDER BY created_at ASC"
    ).fetchall()
    stats = {
        "pending": db.execute("SELECT COUNT(*) FROM posts WHERE status='pending'").fetchone()[0],
        "approved": db.execute("SELECT COUNT(*) FROM posts WHERE status='approved'").fetchone()[0],
        "rejected": db.execute("SELECT COUNT(*) FROM posts WHERE status='rejected'").fetchone()[0],
        "users": db.execute("SELECT COUNT(*) FROM users").fetchone()[0],
    }
    return render_template("admin_dashboard.html", pending=pending, stats=stats)


@bp.route("/posts")
@admin_required
def all_posts():
    db = get_db()
    status = request.args.get("status", "").strip()
    query = "SELECT * FROM posts"
    params = []
    if status in ("pending", "approved", "rejected"):
        query += " WHERE status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"
    posts = db.execute(query, params).fetchall()
    return render_template("admin_posts.html", posts=posts, active_status=status)


@bp.route("/posts/<int:post_id>/approve", methods=["POST"])
@admin_required
def approve(post_id):
    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("admin.dashboard"))

    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)
    db.execute(
        "UPDATE posts SET status = 'approved', approved_at = datetime('now'), admin_note = NULL WHERE id = ?",
        (post_id,),
    )
    db.commit()
    flash(f'"{post["title"]}" is now live on The Voyage Journal.', "success")
    return redirect(request.form.get("next") or url_for("admin.dashboard"))


@bp.route("/posts/<int:post_id>/reject", methods=["POST"])
@admin_required
def reject(post_id):
    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("admin.dashboard"))

    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)
    note = request.form.get("note", "").strip()
    db.execute(
        "UPDATE posts SET status = 'rejected', admin_note = ?, pinned = 0, pinned_at = NULL "
        "WHERE id = ?",
        (note, post_id),
    )
    db.commit()
    flash(f'"{post["title"]}" was declined.', "success")
    return redirect(request.form.get("next") or url_for("admin.dashboard"))


@bp.route("/posts/<int:post_id>/unpublish", methods=["POST"])
@admin_required
def unpublish(post_id):
    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("admin.all_posts"))

    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)
    db.execute(
        "UPDATE posts SET status = 'pending', pinned = 0, pinned_at = NULL WHERE id = ?",
        (post_id,),
    )
    db.commit()
    flash(f'"{post["title"]}" moved back to pending review.', "success")
    return redirect(url_for("admin.all_posts"))


@bp.route("/posts/<int:post_id>/pin", methods=["POST"])
@admin_required
def pin(post_id):
    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("admin.all_posts"))

    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)
    if post["status"] != "approved":
        flash("Only live stories can be pinned to the homepage.", "error")
        return redirect(request.form.get("next") or url_for("admin.all_posts"))

    db.execute(
        "UPDATE posts SET pinned = 1, pinned_at = datetime('now') WHERE id = ?", (post_id,)
    )
    db.commit()
    flash(f'"{post["title"]}" is now pinned to the homepage Featured carousel.', "success")
    return redirect(request.form.get("next") or url_for("admin.all_posts"))


@bp.route("/posts/<int:post_id>/unpin", methods=["POST"])
@admin_required
def unpin(post_id):
    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("admin.all_posts"))

    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)
    db.execute("UPDATE posts SET pinned = 0, pinned_at = NULL WHERE id = ?", (post_id,))
    db.commit()
    flash(f'"{post["title"]}" was unpinned from the homepage.', "success")
    return redirect(request.form.get("next") or url_for("admin.all_posts"))


@bp.route("/posts/<int:post_id>/delete", methods=["POST"])
@admin_required
def delete(post_id):
    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("admin.dashboard"))

    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if post is None:
        abort(404)

    gallery = db.execute(
        "SELECT filename FROM post_images WHERE post_id = ?", (post_id,)
    ).fetchall()
    candidate_filenames = {row["filename"] for row in gallery}
    if post["cover_image"]:
        candidate_filenames.add(post["cover_image"])

    # Deleting the post row cascades to its likes/comments/post_images rows
    # (all declared ON DELETE CASCADE in schema.sql), but the actual image
    # files on disk need removing separately.
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()

    if candidate_filenames:
        upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
        for filename in candidate_filenames:
            # Defensive: only delete a file if no *other* post still
            # references that exact filename (filenames are unique per
            # upload, but this guards against any accidental reuse).
            still_used = db.execute(
                "SELECT 1 FROM posts WHERE cover_image = ? "
                "UNION SELECT 1 FROM post_images WHERE filename = ? LIMIT 1",
                (filename, filename),
            ).fetchone()
            if still_used:
                continue
            file_path = upload_dir / filename
            try:
                file_path.unlink(missing_ok=True)
            except OSError:
                pass  # best-effort cleanup; the DB delete already succeeded

    flash(f'"{post["title"]}" was permanently deleted.', "success")
    return redirect(request.form.get("next") or url_for("admin.all_posts"))
