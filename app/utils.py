from __future__ import annotations

import base64
import functools
import html as html_lib
import io
import logging
import os
import re
import secrets
import time
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

import requests
from flask import (
    current_app,
    flash,
    g,
    redirect,
    request,
    session,
    url_for,
)
from PIL import Image, ImageOps

from .db import get_db

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
# Sized generously for quality (retina-sharp on large screens) while still
# capping how heavy a single photo/page can get. Anything larger than these
# is downsized on save. Anything smaller gets AI-upscaled first (see
# _ai_upscale below) when it's below UPSCALE_MIN_DIMENSION, then capped down
# to these same limits like everything else.
COVER_MAX_SIZE = (3000, 1875)
GALLERY_MAX_SIZE = (2600, 2600)
MAX_IMAGE_BYTES = 50 * 1024 * 1024  # 50MB per photo (cover or gallery) — effectively unlimited for real photos
MAX_GALLERY_IMAGES = 10

# ---------------------------------------------------------------------------
# AI upscaling for low-resolution photos (Replicate / Real-ESRGAN)
# ---------------------------------------------------------------------------
# A photo whose longer edge is under this is treated as "low quality" and
# sent through Real-ESRGAN before the normal resize/save step, so it ends up
# sharper and closer to our usual display size instead of looking soft or
# undersized next to everything else. Entirely optional: with no
# REPLICATE_API_TOKEN set, this is a no-op and photos are saved exactly as
# before. Any failure (missing key, network error, timeout, bad response)
# falls back to the original photo — this must never block an upload.
_upscale_logger = logging.getLogger("voyage_journal.upscale")
REPLICATE_API_TOKEN = os.environ.get("REPLICATE_API_TOKEN")
REPLICATE_MODEL = "nightmareai/real-esrgan"
UPSCALE_MIN_DIMENSION = 1200
UPSCALE_INITIAL_TIMEOUT = 65  # seconds — covers Replicate's own up-to-60s "Prefer: wait" hold
UPSCALE_POLL_TIMEOUT = 30  # seconds — extra time we'll keep polling if it's still running after that


def _ai_upscale(image: Image.Image) -> Image.Image | None:
    """Sends a low-resolution photo to Real-ESRGAN via the Replicate API and
    returns the upscaled result, or None if it's unconfigured, fails, or
    times out — callers fall back to the original photo in that case."""
    if not REPLICATE_API_TOKEN:
        return None
    try:
        buf = io.BytesIO()
        rgb_image = image.convert("RGB") if image.mode != "RGB" else image
        rgb_image.save(buf, format="PNG")
        data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")

        headers = {
            "Authorization": f"Bearer {REPLICATE_API_TOKEN}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        }
        resp = requests.post(
            f"https://api.replicate.com/v1/models/{REPLICATE_MODEL}/predictions",
            headers=headers,
            json={"input": {"image": data_uri, "scale": 4, "face_enhance": False}},
            timeout=UPSCALE_INITIAL_TIMEOUT,
        )
        resp.raise_for_status()
        prediction = resp.json()

        get_url = (prediction.get("urls") or {}).get("get")
        deadline = time.monotonic() + UPSCALE_POLL_TIMEOUT
        while prediction.get("status") in ("starting", "processing") and get_url and time.monotonic() < deadline:
            time.sleep(2)
            poll = requests.get(get_url, headers=headers, timeout=20)
            poll.raise_for_status()
            prediction = poll.json()

        if prediction.get("status") != "succeeded":
            _upscale_logger.warning("Replicate upscale did not succeed: status=%r", prediction.get("status"))
            return None

        output = prediction.get("output")
        if isinstance(output, list):
            output = output[0] if output else None
        if not output or not isinstance(output, str):
            return None

        img_resp = requests.get(output, timeout=60)
        img_resp.raise_for_status()
        return Image.open(io.BytesIO(img_resp.content))
    except Exception:
        _upscale_logger.exception("AI photo upscaling failed; using the original photo instead.")
        return None


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[-\s]+", "-", text)
    return text or secrets.token_hex(4)


def unique_slug(base_slug: str) -> str:
    db = get_db()
    slug = base_slug
    n = 2
    while db.execute("SELECT 1 FROM posts WHERE slug = ?", (slug,)).fetchone():
        slug = f"{base_slug}-{n}"
        n += 1
    return slug


def allowed_image(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def _file_size(file_storage) -> int:
    stream = file_storage.stream
    pos = stream.tell()
    stream.seek(0, 2)  # end
    size = stream.tell()
    stream.seek(pos)
    return size


def save_image(file_storage, max_size=COVER_MAX_SIZE) -> str | None:
    """Validate, downsize, and save an uploaded image. Returns the stored filename, or None."""
    if not file_storage or not file_storage.filename:
        return None
    if not allowed_image(file_storage.filename):
        raise ValueError(f'"{file_storage.filename}" isn\'t a JPG, PNG, WEBP or GIF image.')
    if _file_size(file_storage) > MAX_IMAGE_BYTES:
        raise ValueError(f'"{file_storage.filename}" is larger than the 50MB limit per photo.')

    ext = file_storage.filename.rsplit(".", 1)[1].lower()
    if ext == "jpeg":
        ext = "jpg"
    fname = f"{secrets.token_hex(12)}.{ext}"
    upload_dir = Path(current_app.config["UPLOAD_FOLDER"])
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / fname

    try:
        image = Image.open(file_storage.stream)
        image = ImageOps.exif_transpose(image)
        if image.mode not in ("RGB", "RGBA"):
            image = image.convert("RGB")

        if ext != "gif" and max(image.size) < UPSCALE_MIN_DIMENSION:
            upscaled = _ai_upscale(image)
            if upscaled is not None:
                image = upscaled
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGB")

        image.thumbnail(max_size, Image.LANCZOS)
        save_kwargs = {"quality": 87, "optimize": True} if ext in ("jpg", "webp") else {}
        image.save(dest, **save_kwargs)
    except Exception as e:
        raise ValueError(f'"{file_storage.filename}" couldn\'t be read as an image.') from e
    return fname


def save_cover_image(file_storage) -> str | None:
    """Save + downsize an uploaded cover image. Returns the stored filename, or None."""
    return save_image(file_storage, max_size=COVER_MAX_SIZE)


def save_gallery_images(file_storages) -> list[str]:
    """Save + downsize up to MAX_GALLERY_IMAGES gallery photos. Returns stored filenames."""
    files = [f for f in (file_storages or []) if f and f.filename]
    if len(files) > MAX_GALLERY_IMAGES:
        raise ValueError(f"You can attach up to {MAX_GALLERY_IMAGES} extra photos per story.")
    return [save_image(f, max_size=GALLERY_MAX_SIZE) for f in files]


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def load_logged_in_user():
    user_id = session.get("user_id")
    if user_id is None:
        g.user = None
    else:
        g.user = get_db().execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            flash("Please log in to do that.", "warning")
            return redirect(url_for("auth.login", next=request.path))
        return view(**kwargs)

    return wrapped_view


def admin_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            flash("Please log in as an admin to continue.", "warning")
            return redirect(url_for("auth.login", next=request.path))
        if g.user["role"] != "admin":
            flash("That page is for admins only.", "error")
            return redirect(url_for("blog.home"))
        return view(**kwargs)

    return wrapped_view


# ---------------------------------------------------------------------------
# CSRF (lightweight, session-token based — no external deps)
# ---------------------------------------------------------------------------

def csrf_token() -> str:
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(24)
    return session["csrf_token"]


def validate_csrf(form) -> bool:
    token = form.get("csrf_token", "")
    return token and secrets.compare_digest(token, session.get("csrf_token", ""))


# ---------------------------------------------------------------------------
# Story content sanitization
#
# The rich text editor (submit/edit pages) now sends real HTML for a story's
# body — including <span style="font-family/font-size:..."> for the author's
# font choices — instead of the old plain "markdown-lite" text. Since story
# submission needs no account and the resulting HTML is rendered unescaped
# on a public page (and in the admin preview), every submission is run
# through this allowlist sanitizer server-side before it's ever stored,
# regardless of what the client claims to have already cleaned up.
#
# No sanitizer library (bleach, nh3, ...) could be installed in this sandbox
# (PyPI is network-blocked here, same as npm), so this is a small, careful,
# stdlib-only allowlist parser: only a fixed set of tags survive, every
# other tag is unwrapped (dropped, keeping its text), <script>/<style> drop
# their contents entirely, and the only attribute kept anywhere is a
# `style` on <span> — and even then, only after every individual CSS
# declaration is checked against a strict allowlist of exactly
# font-family/font-size with a safe-looking value. Nothing else (classes,
# ids, event handlers, href/src, arbitrary CSS) ever survives.
# ---------------------------------------------------------------------------

_STORY_ALLOWED_TAGS = {
    "p", "div", "br", "b", "strong", "i", "em", "ul", "ol", "li", "span",
    # Underline — "u" is what execCommand("underline") actually emits, a
    # plain attribute-less tag handled by the same generic branch as
    # b/i/strong/em below, nothing else to special-case.
    "u",
    # Table tags: kept as themselves (not unwrapped to <p> like a bare <div>)
    # so a table pasted in from Word/Pages/Excel keeps its grid structure
    # instead of collapsing into a run of plain paragraphs.
    "table", "thead", "tbody", "tfoot", "tr", "td", "th",
}
_STORY_VOID_TAGS = {"br"}
_STORY_TABLE_TAGS = {"table", "thead", "tbody", "tfoot", "tr", "td", "th"}

_STYLE_DECL_RE = re.compile(r"^\s*([a-zA-Z-]+)\s*:\s*(.+?)\s*$")
_FONT_FAMILY_VALUE_RE = re.compile(r"^[a-zA-Z0-9 ,'\".-]{1,80}$")
# Word/Pages/Excel paste consistently expresses copied font sizes in points
# (e.g. "font-size:12pt") rather than px/em/rem/% — without "pt" here, every
# font size a user pastes in from a Word/Pages doc was silently dropped even
# though the rest of the run-formatting (bold/italic/family) survived.
_FONT_SIZE_VALUE_RE = re.compile(r"^\d{1,3}(\.\d{1,2})?(px|em|rem|%|pt)$")
# Merged-cell spans from a pasted table — digits only, small range, nothing
# else is ever kept on a table-related tag (no style/class/width/border/...).
_SPAN_ATTR_VALUE_RE = re.compile(r"^([1-9]|[1-4][0-9]|50)$")  # 1-50


def _clean_story_style(style_value: str) -> str:
    """Keep only font-family/font-size declarations with a safe-looking
    value; silently drop everything else (no url(), expression(),
    javascript:, extra properties, !important, etc.)."""
    if not style_value:
        return ""
    kept = []
    for decl in style_value.split(";"):
        m = _STYLE_DECL_RE.match(decl)
        if not m:
            continue
        prop, value = m.group(1).lower(), m.group(2).strip()
        if prop == "font-family" and _FONT_FAMILY_VALUE_RE.match(value):
            kept.append(f"font-family: {value}")
        elif prop == "font-size" and _FONT_SIZE_VALUE_RE.match(value):
            kept.append(f"font-size: {value}")
    return "; ".join(kept)


class _StoryHTMLSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self._skip_depth = 0  # inside a <script>/<style> we drop entirely
        self._stack = []  # tags we actually emitted an opening tag for

    def handle_starttag(self, tag, attrs):
        self._open(tag, attrs, void=False)

    def handle_startendtag(self, tag, attrs):
        self._open(tag, attrs, void=True)

    def _open(self, tag, attrs, void):
        if tag in ("script", "style"):
            self._skip_depth += 1
            return
        if self._skip_depth:
            return
        if tag not in _STORY_ALLOWED_TAGS:
            return  # unwrap: drop the tag itself, its text/children still flow through normally
        out_tag = "p" if tag == "div" else tag

        if out_tag == "br":
            self.out.append("<br>")
            return

        if out_tag == "span":
            style = ""
            for name, value in attrs:
                if name == "style":
                    style = _clean_story_style(value or "")
            if not style:
                return  # nothing safe survived — a bare <span> isn't worth keeping
            self.out.append('<span style="' + html_lib.escape(style, quote=True) + '">')
        elif out_tag in ("td", "th"):
            # colspan/rowspan are the only attributes ever kept on a table
            # tag (needed so a merged-cell header row from a pasted table
            # doesn't silently collapse back into a plain grid) — digits
            # only, everything else (style/class/width/bgcolor/...) is
            # always dropped, same as every other tag here.
            kept_attrs = ""
            for name, value in attrs:
                if name in ("colspan", "rowspan") and _SPAN_ATTR_VALUE_RE.match((value or "").strip()):
                    kept_attrs += f' {name}="{value.strip()}"'
            self.out.append(f"<{out_tag}{kept_attrs}>")
        else:
            self.out.append(f"<{out_tag}>")

        if void:
            self.out.append(f"</{out_tag}>")
        else:
            self._stack.append(out_tag)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth:
            return
        out_tag = "p" if tag == "div" else tag
        if out_tag in _STORY_VOID_TAGS or out_tag not in self._stack:
            return
        # Close back to (and including) the matching tag. Almost always
        # this is just the top of the stack; the loop is only there to
        # self-heal against unbalanced/foreign markup rather than ever
        # emit a stray, mismatched closing tag.
        while self._stack:
            t = self._stack.pop()
            self.out.append(f"</{t}>")
            if t == out_tag:
                break

    def handle_data(self, data):
        if self._skip_depth:
            return
        self.out.append(html_lib.escape(data))

    def close_all_open_tags(self):
        while self._stack:
            self.out.append(f"</{self._stack.pop()}>")

    def get_html(self) -> str:
        return "".join(self.out)


def sanitize_story_html(raw_html: str) -> str:
    """Allowlist-sanitize a story body that's already real HTML (from the
    rich editor). See the module-level comment above for the security
    rationale — this is the boundary every submission crosses before it's
    ever written to the database."""
    parser = _StoryHTMLSanitizer()
    parser.feed(raw_html or "")
    parser.close()
    parser.close_all_open_tags()
    return parser.get_html()


def looks_like_html(raw: str) -> bool:
    """Heuristic for telling the rich editor's real HTML output apart from
    the no-JavaScript fallback's plain typed text (which may itself use
    typed **bold**/*italic*/"- " markdown-lite syntax). The editor always
    serializes to a string starting with a tag; genuine prose essentially
    never starts with a literal '<' character."""
    return raw.lstrip().startswith("<")


def strip_story_html(html_content: str) -> str:
    """Plain-text length of a (sanitized) story body — used for the
    minimum-length validation and as a fallback when generating an excerpt,
    so neither counts HTML tag characters or inline [[photo:N|size|align]]
    placement tokens as if they were prose. The photo pattern mirrors
    blog.py's INLINE_PHOTO_RE (bare, size-only, or size+align). The
    [[pdf:N]] pattern is a legacy leftover from the since-removed file-
    attachment feature — kept here purely so a story saved while that
    feature still existed doesn't have a stray token counted as prose."""
    text = re.sub(r"<[^>]+>", " ", html_content or "")
    text = html_lib.unescape(text)
    text = re.sub(r"\[\[photo:\d+(?:\|(?:small|medium|large|full))?(?:\|(?:left|right|center))?\]\]", " ", text)
    text = re.sub(r"\[\[pdf:\d+\]\]", " ", text)
    return re.sub(r"\s+", " ", text).strip()
