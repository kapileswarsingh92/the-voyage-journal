import base64
import html as html_lib
import re

import markdown as md
from flask import (
    Blueprint,
    abort,
    current_app,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    url_for,
)

from .db import get_db
from .docx_import import DocxImportError, parse_docx
from .utils import (
    MAX_GALLERY_IMAGES,
    MAX_STORY_PDFS,
    file_badge_label,
    login_required,
    looks_like_html,
    sanitize_story_html,
    save_cover_image,
    save_gallery_images,
    save_pdfs,
    slugify,
    strip_story_html,
    unique_slug,
    validate_csrf,
)

bp = Blueprint("blog", __name__)


INLINE_PHOTO_SIZES = {"small", "medium", "large", "full"}
INLINE_PHOTO_ALIGNS = {"left", "right", "center"}
# The |size and |align suffixes are both optional and independent of each
# other's presence — a token can be a bare [[photo:N]] (pre-dates either
# feature), [[photo:N|size]] (size-only, from before alignment existed), or
# [[photo:N|size|align]] (both). Since the size and alignment keyword sets
# never overlap, this is unambiguous to parse regardless of which are
# present, so every token ever saved still matches and needs no migration —
# see render_story_content, which treats a missing size as "full" and a
# missing align as "center".
INLINE_PHOTO_RE = re.compile(
    r"\[\[photo:(\d+)(?:\|(small|medium|large|full))?(?:\|(left|right|center))?\]\]"
)


def referenced_photo_positions(raw: str) -> set:
    """Which post_images positions (0-indexed) are placed inline via [[photo:N]] tokens."""
    return {int(m.group(1)) - 1 for m in INLINE_PHOTO_RE.finditer(raw or "")}


# PDFs are inserted the same way photos are — a [[pdf:N]] token in the
# story body, N matching the 1-indexed order they were attached in — but
# rendered as a download card rather than processed/resized, so there's no
# size or align modifier to parse.
INLINE_PDF_RE = re.compile(r"\[\[pdf:(\d+)\]\]")


def referenced_pdf_positions(raw: str) -> set:
    """Which post_pdfs positions (0-indexed) are placed inline via [[pdf:N]] tokens."""
    return {int(m.group(1)) - 1 for m in INLINE_PDF_RE.finditer(raw or "")}


def normalize_story_content(raw: str) -> str:
    """Turn whatever the submit/edit form posted for `content` into safe,
    storage-ready HTML — this is the ONE place story bodies are sanitized,
    called right when a submission is read, before anything else touches
    it (validation, the DB, or an error-page re-render all see the result
    of this, never the raw POST body).

    Two possible inputs land here:
      - real HTML from the JS rich editor (font spans, bold/italic, lists,
        [[photo:N]] markers) — run through the allowlist sanitizer.
      - plain text from the no-JS fallback textarea (typed **bold**,
        *italic*, "- " lists, blank-line paragraphs) — escaped and run
        through the markdown-lite renderer, same as this app always did,
        which produces safe HTML directly since the input was escaped first.

    Either way, what comes out is already-safe HTML ready to store as-is;
    rendering it later (`render_story_content`) is just [[photo:N]] token
    substitution, not further escaping or parsing.
    """
    raw = raw or ""
    if looks_like_html(raw):
        return sanitize_story_html(raw)
    escaped = html_lib.escape(raw)
    return md.markdown(escaped, extensions=["nl2br", "sane_lists"])


def render_story_content(stored_html: str, images=None, pdfs=None) -> str:
    """Swap [[photo:N]] and [[pdf:N]] tokens in an already-sanitized, stored
    story body for real inline photos / PDF download cards (N is 1-indexed,
    matching the order each was attached in). No escaping or markdown
    parsing happens here — that all already happened once, at save time, in
    `normalize_story_content`."""
    html_out = stored_html or ""
    images = images or []
    pdfs = pdfs or []

    def _swap(match):
        n = int(match.group(1))
        if n < 1 or n > len(images):
            return ""
        size = match.group(2) or "full"
        if size not in INLINE_PHOTO_SIZES:
            size = "full"
        align = match.group(3) or "center"
        if align not in INLINE_PHOTO_ALIGNS:
            align = "center"
        img = images[n - 1]
        url = url_for("uploaded_file", filename=img["filename"])
        return (
            f'<figure class="inline-photo inline-photo--{size} inline-photo--{align}">'
            f'<button type="button" class="gallery-thumb inline-gallery-thumb" data-gallery-thumb '
            f'data-full="{url}" data-alt="Story photo {n}">'
            f'<img src="{url}" alt="Story photo {n}" loading="lazy"></button>'
            "</figure>"
        )

    def _swap_pdf(match):
        n = int(match.group(1))
        if n < 1 or n > len(pdfs):
            return ""
        pdf = pdfs[n - 1]
        url = url_for("uploaded_file", filename=pdf["filename"])
        name = html_lib.escape(pdf["original_filename"])
        badge = file_badge_label(pdf["filename"])
        return (
            f'<a class="pdf-attachment" href="{url}" download="{name}" target="_blank" rel="noopener">'
            f'<span class="pdf-attachment-icon" aria-hidden="true">{badge}</span>'
            f'<span class="pdf-attachment-name">{name}</span>'
            f'<span class="pdf-attachment-cta">Download</span>'
            "</a>"
        )

    # The token is normally alone in its own paragraph; swap the whole
    # paragraph so the figure/card stays a clean block element (not nested
    # inside a <p>) — that's what lets a left/right-floated photo have
    # surrounding paragraphs wrap around it as actual siblings, not
    # descendants.
    html_out = re.sub(
        r"<p>\s*" + INLINE_PHOTO_RE.pattern + r"\s*</p>", _swap, html_out
    )
    html_out = re.sub(
        r"<p>\s*" + INLINE_PDF_RE.pattern + r"\s*</p>", _swap_pdf, html_out
    )
    # fallback for a token left inline within running text
    html_out = INLINE_PHOTO_RE.sub(_swap, html_out)
    html_out = INLINE_PDF_RE.sub(_swap_pdf, html_out)
    return html_out


def plain_excerpt(html_content: str, length: int = 180) -> str:
    text = strip_story_html(html_content)
    if len(text) <= length:
        return text
    return text[:length].rsplit(" ", 1)[0] + "…"


def _post_with_counts(row):
    post = dict(row)
    db = get_db()
    post["like_count"] = db.execute(
        "SELECT COUNT(*) FROM likes WHERE post_id = ?", (post["id"],)
    ).fetchone()[0]
    post["comment_count"] = db.execute(
        "SELECT COUNT(*) FROM comments WHERE post_id = ?", (post["id"],)
    ).fetchone()[0]
    post["gallery_count"] = db.execute(
        "SELECT COUNT(*) FROM post_images WHERE post_id = ?", (post["id"],)
    ).fetchone()[0]
    return post


@bp.route("/")
def home():
    db = get_db()
    approved = db.execute(
        "SELECT * FROM posts WHERE status = 'approved' ORDER BY approved_at DESC, created_at DESC"
    ).fetchall()
    posts = [_post_with_counts(r) for r in approved]

    # Admin-pinned posts always populate the homepage Featured carousel,
    # regardless of how old they are — most recently pinned first. If
    # nothing is pinned, fall back to just the single newest post (the
    # site's original behaviour before pinning existed).
    pinned_posts = sorted(
        (p for p in posts if p["pinned"]),
        key=lambda p: p["pinned_at"] or "",
        reverse=True,
    )
    if pinned_posts:
        featured_posts = pinned_posts
    elif posts:
        featured_posts = [posts[0]]
    else:
        featured_posts = []

    featured_ids = {p["id"] for p in featured_posts}
    latest = [p for p in posts if p["id"] not in featured_ids][:6]
    trending = sorted(posts, key=lambda p: p["like_count"], reverse=True)[:3]
    return render_template(
        "index.html", featured_posts=featured_posts, latest=latest, trending=trending
    )


SORT_OPTIONS = {
    "newest": "Newest first",
    "liked": "Most liked",
    "title": "Title (A–Z)",
    "location": "Location (A–Z)",
}


@bp.route("/blog")
def listing():
    db = get_db()
    category = request.args.get("category", "").strip()
    location = request.args.get("location", "").strip()
    q = request.args.get("q", "").strip()
    sort = request.args.get("sort", "newest").strip()
    if sort not in SORT_OPTIONS:
        sort = "newest"

    query = "SELECT * FROM posts WHERE status = 'approved'"
    params = []
    if category:
        query += " AND category = ?"
        params.append(category)
    if location:
        query += " AND location = ?"
        params.append(location)
    if q:
        query += " AND (title LIKE ? OR excerpt LIKE ? OR content LIKE ? OR location LIKE ?)"
        like = f"%{q}%"
        params.extend([like, like, like, like])
    query += " ORDER BY approved_at DESC, created_at DESC"

    rows = db.execute(query, params).fetchall()
    posts = [_post_with_counts(r) for r in rows]

    if sort == "liked":
        posts.sort(key=lambda p: p["like_count"], reverse=True)
    elif sort == "title":
        posts.sort(key=lambda p: (p["title"] or "").lower())
    elif sort == "location":
        posts.sort(key=lambda p: (p["location"] or "").lower())
    # "newest" is already the SQL order (approved_at desc, created_at desc)

    all_locations = [
        r["location"]
        for r in db.execute(
            "SELECT DISTINCT location FROM posts "
            "WHERE status = 'approved' AND location IS NOT NULL AND location != '' "
            "ORDER BY location ASC"
        ).fetchall()
    ]

    return render_template(
        "blog_list.html",
        posts=posts,
        active_category=category,
        active_location=location,
        active_sort=sort,
        sort_options=SORT_OPTIONS,
        all_locations=all_locations,
        q=q,
    )


@bp.route("/blog/<slug>")
def detail(slug):
    db = get_db()
    row = db.execute("SELECT * FROM posts WHERE slug = ?", (slug,)).fetchone()
    if row is None:
        abort(404)

    is_admin = g.user and g.user["role"] == "admin"
    if row["status"] != "approved" and not is_admin:
        # Non-admins can only ever see approved stories at this URL —
        # pending/declined posts don't exist publicly yet.
        abort(404)
    preview = row["status"] != "approved"

    post = _post_with_counts(row)

    gallery = db.execute(
        "SELECT * FROM post_images WHERE post_id = ? ORDER BY position ASC, id ASC",
        (post["id"],),
    ).fetchall()
    pdfs = db.execute(
        "SELECT * FROM post_pdfs WHERE post_id = ? ORDER BY position ASC, id ASC",
        (post["id"],),
    ).fetchall()

    post["content_html"] = render_story_content(post["content"], gallery, pdfs)

    placed = referenced_photo_positions(post["content"])
    leftover_gallery = [img for img in gallery if img["position"] not in placed]
    placed_pdfs = referenced_pdf_positions(post["content"])
    leftover_pdfs = [pdf for pdf in pdfs if pdf["position"] not in placed_pdfs]

    # Count a view for everyone except the story's own author or an admin,
    # so the "My Stories" view count isn't inflated by the writer checking
    # their own published story.
    is_owner_or_admin = g.user and (
        g.user["id"] == post["submitted_by_user_id"] or g.user["role"] == "admin"
    )
    if not is_owner_or_admin:
        db.execute("UPDATE posts SET view_count = view_count + 1 WHERE id = ?", (post["id"],))
        db.commit()
        post["view_count"] += 1

    liked = False
    if g.user:
        liked = (
            db.execute(
                "SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?",
                (post["id"], g.user["id"]),
            ).fetchone()
            is not None
        )

    comments = db.execute(
        """SELECT comments.*, users.name AS author
           FROM comments JOIN users ON users.id = comments.user_id
           WHERE post_id = ? ORDER BY comments.created_at ASC""",
        (post["id"],),
    ).fetchall()

    related = db.execute(
        """SELECT * FROM posts
           WHERE status = 'approved' AND category = ? AND id != ?
           ORDER BY approved_at DESC LIMIT 3""",
        (post["category"], post["id"]),
    ).fetchall()
    related = [_post_with_counts(r) for r in related]

    share_url = request.url_root.rstrip("/") + url_for("blog.detail", slug=slug)

    return render_template(
        "blog_detail.html",
        post=post,
        liked=liked,
        comments=comments,
        related=related,
        gallery=gallery,
        leftover_gallery=leftover_gallery,
        leftover_pdfs=leftover_pdfs,
        share_url=share_url,
        preview=preview,
    )


@bp.route("/blog/<slug>/like", methods=["POST"])
@login_required
def like(slug):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE slug = ? AND status='approved'", (slug,)).fetchone()
    if post is None:
        abort(404)

    wants_json = request.headers.get("X-Requested-With") == "fetch"

    if not validate_csrf(request.form):
        if wants_json:
            return jsonify(error="Session expired, please refresh."), 400
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("blog.detail", slug=slug))

    existing = db.execute(
        "SELECT id FROM likes WHERE post_id = ? AND user_id = ?", (post["id"], g.user["id"])
    ).fetchone()
    if existing:
        db.execute("DELETE FROM likes WHERE id = ?", (existing["id"],))
        liked = False
    else:
        db.execute(
            "INSERT INTO likes (post_id, user_id) VALUES (?, ?)", (post["id"], g.user["id"])
        )
        liked = True
    db.commit()

    count = db.execute("SELECT COUNT(*) FROM likes WHERE post_id = ?", (post["id"],)).fetchone()[0]

    if wants_json:
        return jsonify(liked=liked, count=count)
    return redirect(url_for("blog.detail", slug=slug) + "#top")


@bp.route("/blog/<slug>/comment", methods=["POST"])
@login_required
def comment(slug):
    db = get_db()
    post = db.execute("SELECT * FROM posts WHERE slug = ? AND status='approved'", (slug,)).fetchone()
    if post is None:
        abort(404)

    if not validate_csrf(request.form):
        flash("Your session expired — please try again.", "error")
        return redirect(url_for("blog.detail", slug=slug))

    body = request.form.get("content", "").strip()
    if not body:
        flash("Your comment can't be empty.", "error")
    elif len(body) > 2000:
        flash("That comment is a little too long (max 2000 characters).", "error")
    else:
        db.execute(
            "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
            (post["id"], g.user["id"], body),
        )
        db.commit()
        flash("Comment posted — thanks for joining the conversation!", "success")

    return redirect(url_for("blog.detail", slug=slug) + "#comments")


@bp.route("/blog/<slug>/share", methods=["POST"])
@login_required
def share(slug):
    db = get_db()
    post = db.execute("SELECT id FROM posts WHERE slug = ? AND status='approved'", (slug,)).fetchone()
    if post is None:
        abort(404)
    if not validate_csrf(request.form):
        return jsonify(error="Session expired"), 400
    db.execute("UPDATE posts SET share_count = share_count + 1 WHERE id = ?", (post["id"],))
    db.commit()
    count = db.execute("SELECT share_count FROM posts WHERE id = ?", (post["id"],)).fetchone()[0]
    return jsonify(ok=True, count=count)


@bp.route("/docx-import", methods=["POST"])
def docx_import():
    """AJAX endpoint behind the "Insert file" toolbar button's smarter
    .docx handling: parses an uploaded Word document into story-editor
    HTML + extracted images and hands them back as JSON, without touching
    the database — the client is responsible for turning the result into
    real editor content and (only once the story is actually submitted)
    real uploads. No login required, matching /submit's own anonymous
    access; still CSRF-protected like every other POST here."""
    if not validate_csrf(request.form):
        return jsonify(error="Your session expired — please refresh the page and try again."), 400
    file_storage = request.files.get("docx_file")
    if not file_storage or not file_storage.filename:
        return jsonify(error="No file received."), 400

    try:
        html_out, images = parse_docx(file_storage, MAX_GALLERY_IMAGES)
    except DocxImportError as e:
        return jsonify(error=str(e)), 400
    except Exception:
        current_app.logger.exception("Unexpected error importing a Word document")
        return jsonify(error="Something went wrong reading that document."), 400

    images_out = [
        {
            "content_type": img["content_type"],
            "data_url": "data:" + img["content_type"] + ";base64," + base64.b64encode(img["data"]).decode("ascii"),
        }
        for img in images
    ]
    return jsonify(ok=True, html=html_out, images=images_out)


@bp.route("/submit", methods=("GET", "POST"))
def submit():
    if request.method == "POST":
        if not validate_csrf(request.form):
            flash("Your session expired — please refresh and try again.", "error")
            return render_template(
                "submit.html", form=request.form, max_gallery=MAX_GALLERY_IMAGES, max_pdfs=MAX_STORY_PDFS
            )

        title = request.form.get("title", "").strip()
        category = request.form.get("category", "").strip()
        location = request.form.get("location", "").strip()
        author_name = request.form.get("author_name", "").strip()
        author_email = request.form.get("author_email", "").strip()
        excerpt = request.form.get("excerpt", "").strip()
        # Sanitized immediately — everything downstream (validation, the
        # DB, and any error-page re-render) only ever sees this, never the
        # raw POST body. See normalize_story_content()'s docstring.
        content = normalize_story_content(request.form.get("content", ""))
        form_data = request.form.to_dict()
        form_data["content"] = content

        error = None
        if not title or len(title) < 4:
            error = "Please give your story a title (at least 4 characters)."
        elif category not in current_app.config["CATEGORIES"]:
            error = "Please choose a category."
        elif not author_name:
            error = "Please tell us who wrote this."
        elif len(strip_story_html(content)) < 100:
            error = "Your story needs a bit more detail (at least 100 characters)."

        cover_filename = None
        inline_filenames = []
        pdf_uploads = []
        if error is None:
            try:
                cover_filename = save_cover_image(request.files.get("cover_image"))
                inline_filenames = save_gallery_images(request.files.getlist("inline_images"))
                pdf_uploads = save_pdfs(request.files.getlist("inline_pdfs"))
            except ValueError as e:
                error = str(e)

        if error:
            flash(error, "error")
            return render_template(
                "submit.html", form=form_data, max_gallery=MAX_GALLERY_IMAGES, max_pdfs=MAX_STORY_PDFS
            )

        db = get_db()
        slug = unique_slug(slugify(title))
        submitted_by = g.user["id"] if g.user else None
        cur = db.execute(
            """INSERT INTO posts
               (title, slug, excerpt, content, cover_image, category, location,
                author_name, author_email, submitted_by_user_id, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
            (
                title,
                slug,
                excerpt or plain_excerpt(content),
                content,
                cover_filename,
                category,
                location,
                author_name,
                author_email,
                submitted_by,
            ),
        )
        post_id = cur.lastrowid
        for i, fname in enumerate(inline_filenames):
            db.execute(
                "INSERT INTO post_images (post_id, filename, position) VALUES (?, ?, ?)",
                (post_id, fname, i),
            )
        for i, pdf in enumerate(pdf_uploads):
            db.execute(
                "INSERT INTO post_pdfs (post_id, filename, original_filename, position) VALUES (?, ?, ?, ?)",
                (post_id, pdf["filename"], pdf["original_filename"], i),
            )
        db.commit()
        return render_template("submit_success.html", title=title)

    return render_template("submit.html", form={}, max_gallery=MAX_GALLERY_IMAGES, max_pdfs=MAX_STORY_PDFS)


@bp.route("/account/my-stories")
@login_required
def my_stories():
    db = get_db()
    rows = db.execute(
        "SELECT * FROM posts WHERE submitted_by_user_id = ? ORDER BY created_at DESC",
        (g.user["id"],),
    ).fetchall()
    posts = [_post_with_counts(r) for r in rows]
    return render_template("my_stories.html", posts=posts)


@bp.route("/blog/<slug>/edit", methods=("GET", "POST"))
@login_required
def edit(slug):
    db = get_db()
    row = db.execute("SELECT * FROM posts WHERE slug = ?", (slug,)).fetchone()
    if row is None:
        abort(404)
    if row["submitted_by_user_id"] != g.user["id"]:
        abort(403)
    post = dict(row)

    gallery = db.execute(
        "SELECT * FROM post_images WHERE post_id = ? ORDER BY position ASC, id ASC",
        (post["id"],),
    ).fetchall()
    placed = referenced_photo_positions(post["content"])
    leftover = [img for img in gallery if img["position"] not in placed]
    existing_photos = [
        {"filename": img["filename"], "url": url_for("uploaded_file", filename=img["filename"])}
        for img in gallery
    ]

    pdf_gallery = db.execute(
        "SELECT * FROM post_pdfs WHERE post_id = ? ORDER BY position ASC, id ASC",
        (post["id"],),
    ).fetchall()
    placed_pdfs = referenced_pdf_positions(post["content"])
    leftover_pdfs = [pdf for pdf in pdf_gallery if pdf["position"] not in placed_pdfs]
    existing_pdfs = [
        {
            "filename": pdf["filename"],
            "original_filename": pdf["original_filename"],
            "url": url_for("uploaded_file", filename=pdf["filename"]),
        }
        for pdf in pdf_gallery
    ]

    template_extra = dict(
        max_gallery=MAX_GALLERY_IMAGES, max_pdfs=MAX_STORY_PDFS,
        gallery=gallery, leftover=leftover, existing_photos=existing_photos,
        pdf_gallery=pdf_gallery, leftover_pdfs=leftover_pdfs, existing_pdfs=existing_pdfs,
    )

    if request.method == "POST":
        if not validate_csrf(request.form):
            flash("Your session expired — please refresh and try again.", "error")
            return render_template(
                "edit_story.html", post=post, form=request.form, error_reload=True, **template_extra
            )

        title = request.form.get("title", "").strip()
        category = request.form.get("category", "").strip()
        location = request.form.get("location", "").strip()
        author_name = request.form.get("author_name", "").strip()
        author_email = request.form.get("author_email", "").strip()
        excerpt = request.form.get("excerpt", "").strip()
        # Sanitized immediately — see normalize_story_content()'s docstring
        # and the matching pattern in submit() above.
        content = normalize_story_content(request.form.get("content", ""))
        form_data = request.form.to_dict()
        form_data["content"] = content
        photo_plan_raw = request.form.get("photo_plan", "").strip()
        remove_leftover_ids = set(request.form.getlist("remove_leftover_ids"))
        pdf_plan_raw = request.form.get("pdf_plan", "").strip()
        remove_leftover_pdf_ids = set(request.form.getlist("remove_leftover_pdf_ids"))

        error = None
        if not title or len(title) < 4:
            error = "Please give your story a title (at least 4 characters)."
        elif category not in current_app.config["CATEGORIES"]:
            error = "Please choose a category."
        elif not author_name:
            error = "Please tell us who wrote this."
        elif len(strip_story_html(content)) < 100:
            error = "Your story needs a bit more detail (at least 100 characters)."

        new_cover_filename = post["cover_image"]
        new_uploaded_inline = []
        new_uploaded_pdfs = []
        if error is None:
            try:
                replacement_cover = save_cover_image(request.files.get("cover_image"))
                if replacement_cover:
                    new_cover_filename = replacement_cover
                new_uploaded_inline = save_gallery_images(request.files.getlist("inline_images"))
                new_uploaded_pdfs = save_pdfs(request.files.getlist("inline_pdfs"))
            except ValueError as e:
                error = str(e)

        final_images = []
        if error is None:
            existing_filenames = {img["filename"] for img in gallery}
            plan = [p.strip() for p in photo_plan_raw.split(",") if p.strip()]
            new_iter = iter(new_uploaded_inline)
            for entry in plan:
                if entry == "new":
                    try:
                        final_images.append(next(new_iter))
                    except StopIteration:
                        error = "Something went wrong matching your uploaded photos — please try inserting them again."
                        break
                elif entry.startswith("existing:"):
                    fname = entry[len("existing:"):]
                    if fname not in existing_filenames:
                        error = "One of the referenced photos is no longer available — please re-insert it."
                        break
                    final_images.append(fname)

            if error is None:
                for img in leftover:
                    if str(img["id"]) not in remove_leftover_ids:
                        final_images.append(img["filename"])

                if len(final_images) > MAX_GALLERY_IMAGES:
                    error = f"A story can have up to {MAX_GALLERY_IMAGES} photos in total."

        final_pdfs = []
        if error is None:
            existing_pdf_by_filename = {pdf["filename"]: pdf["original_filename"] for pdf in pdf_gallery}
            pdf_plan = [p.strip() for p in pdf_plan_raw.split(",") if p.strip()]
            new_pdf_iter = iter(new_uploaded_pdfs)
            for entry in pdf_plan:
                if entry == "new":
                    try:
                        final_pdfs.append(next(new_pdf_iter))
                    except StopIteration:
                        error = "Something went wrong matching your uploaded files — please try inserting them again."
                        break
                elif entry.startswith("existing:"):
                    fname = entry[len("existing:"):]
                    if fname not in existing_pdf_by_filename:
                        error = "One of the referenced files is no longer available — please re-insert it."
                        break
                    final_pdfs.append({"filename": fname, "original_filename": existing_pdf_by_filename[fname]})

            if error is None:
                for pdf in leftover_pdfs:
                    if str(pdf["id"]) not in remove_leftover_pdf_ids:
                        final_pdfs.append({"filename": pdf["filename"], "original_filename": pdf["original_filename"]})

                if len(final_pdfs) > MAX_STORY_PDFS:
                    error = f"A story can have up to {MAX_STORY_PDFS} files in total."

        if error:
            flash(error, "error")
            return render_template(
                "edit_story.html", post=post, form=form_data, error_reload=True, **template_extra
            )

        was_status = post["status"]
        db.execute(
            """UPDATE posts SET title=?, excerpt=?, content=?, cover_image=?, category=?,
               location=?, author_name=?, author_email=?, status='pending', admin_note=NULL,
               approved_at=NULL WHERE id=?""",
            (
                title, excerpt or plain_excerpt(content), content, new_cover_filename, category,
                location, author_name, author_email, post["id"],
            ),
        )
        db.execute("DELETE FROM post_images WHERE post_id = ?", (post["id"],))
        for i, fname in enumerate(final_images):
            db.execute(
                "INSERT INTO post_images (post_id, filename, position) VALUES (?, ?, ?)",
                (post["id"], fname, i),
            )
        db.execute("DELETE FROM post_pdfs WHERE post_id = ?", (post["id"],))
        for i, pdf in enumerate(final_pdfs):
            db.execute(
                "INSERT INTO post_pdfs (post_id, filename, original_filename, position) VALUES (?, ?, ?, ?)",
                (post["id"], pdf["filename"], pdf["original_filename"], i),
            )
        db.commit()

        if was_status == "approved":
            flash(
                "Your story has been unpublished and sent back for review — "
                "it'll go live again once approved.",
                "success",
            )
        else:
            flash("Your changes have been saved and submitted for review.", "success")
        return redirect(url_for("blog.my_stories"))

    return render_template(
        "edit_story.html", post=post, form=post, error_reload=False, **template_extra
    )


@bp.route("/about")
def about():
    return render_template("about.html")
