# The Voyage Journal

> "Travel in a 90's way" — a community travel & lifestyle journal.

A full working web app: anyone can submit a story without an account, every
submission is reviewed by an admin before it goes live, and readers can
like/comment/share once they've created a free account.

Built with **Python + Flask + SQLite** — no build step, no external services,
no npm/pip installs required. Everything it needs (Flask, Pillow, etc.) ships
with a normal Python 3.10+ install, or is already vendored in this project.

## Quick start

```bash
# 1. (optional but recommended) create a virtual environment
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 2. install dependencies
pip install -r requirements.txt

# 3. create the database and load demo content (safe to re-run — it resets the DB)
python3 seed.py

# 4. run it
python3 run.py
```

Then open **http://127.0.0.1:5050**.

The project already ships with a seeded `voyage_journal.db` and generated
cover art in `static/uploads/`, so you can also skip straight to step 4 if
you just want to look around.

## Demo logins

| Role          | Email                          | Password        |
|---------------|---------------------------------|------------------|
| Admin         | admin@voyagejournal.com         | AdminDemo123     |
| Reader        | reader@voyagejournal.com        | ReaderDemo123    |

The admin account can approve/decline submissions at **/admin**. The reader
account already has a few likes/comments seeded in, and also owns two demo
stories (one live, one still pending) so **/account/my-stories** has
something real to show — sign in as the reader and check the "My Stories"
link in the header. You can also sign up your own account from the header.

## What's included

- **Public submissions, no account required** — `/submit` lets anyone send in
  a story (title, category, cover photo, body). It's stored as `pending`.
- **One cover photo per story** — shown as the story's header and as its
  thumbnail everywhere the story appears (homepage, listings, related posts).
- **Rich "insert photo at cursor" editor, with full font control** — the
  story body is a hand-built rich text editor: bold/italic/bullet list, an
  "Insert photo" button, and a **font family + size picker**. The font
  controls apply to whatever text is selected, or — if nothing's selected —
  to the whole story, so it's just as easy to set an overall "voice" for a
  piece as it is to style one sentence. Contributors can drop up to 8 extra
  photos exactly where they're writing — a photo lands as its own block
  right at the cursor, in between whatever paragraphs come before and after
  it, instead of only at the bottom. If JavaScript is off, the same field
  gracefully falls back to a plain textarea that still supports `**bold**`,
  `*italic*`, `- lists`, and the same "insert a photo here" placement via
  typed `[[photo:N]]` markers (font styling needs JavaScript). Any photos a
  contributor doesn't place inline still show up as a gallery grid at the
  bottom of the story with a click-to-expand lightbox (arrow keys /
  swipe-style prev-next); stories with extra photos get a small "📷 N"
  count badge on their card. If a submission is bounced back for fixing
  (e.g. a missing title), any photos already dropped into the editor
  reappear as "please re-attach this photo" placeholders in their original
  spot — the surrounding text is never lost.
- **Preview before submitting** — a "Preview story" button (next to Submit /
  Save changes on both the submit and edit forms) opens the story exactly as
  it'll be published: title, cover photo, formatted text (fonts and all),
  and every inline/cover photo already picked — using the same rendering CSS
  as the live page, so there are no surprises after review.
- **Admin approval queue** — `/admin` lists everything pending, with one-click
  Approve & publish or Decline (with an optional private note). `/admin/posts`
  is a full table of every post ever submitted, with status filters.
- **Admin delete** — a **Delete** button on every post regardless of status
  (pending, live, or declined), on both `/admin` and `/admin/posts`. It's
  permanent: behind a confirmation prompt, it removes the post along with
  its likes, comments, and every photo file it owns (cover + inline/gallery
  photos), and immediately 404s its public URL if it was live.
- **Admin can read a story before deciding** — on both `/admin` and
  `/admin/posts`, a story's title is a link (for any status: pending, live,
  or declined). Clicking it opens the exact same page a reader would see —
  same template, same photos, same formatting — so an admin never has to
  judge a submission from a short excerpt alone. A dark "Admin preview"
  banner sits above the story with **Approve & publish** and **Decline**
  right there, so a pending or declined story can be read and actioned in
  one place, and a declined story shows the private rejection note (if any)
  in the banner. The like/share/comment bar is swapped for a small note
  ("available once this story is live") since those only make sense for
  published stories. Non-admins (including the story's own author, if
  signed in) still get a 404 at that URL for anything not yet approved —
  the preview only unlocks for the admin role, not just being logged in.
- **Admin can pin stories to the homepage** — a **Pin to homepage** /
  **Unpin** button on every *live* post in `/admin/posts`. Pinned stories
  always populate the homepage's **Featured** carousel, regardless of how
  old they are — a story from months ago stays featured for as long as it's
  pinned, right alongside brand-new ones. If nothing is pinned, Featured
  falls back to just the single newest story (the site's original
  behaviour). A pinned story is still an ordinary live post the whole
  time — it keeps showing up in `/blog`, search, and category/location
  filters exactly as before; pinning only adds it to the homepage spotlight
  on top of that. Unpublishing or declining a pinned post automatically
  unpins it too, since a story that isn't live can't stay featured. When
  there's more than one pinned story, the Featured carousel **auto-advances
  every 15 seconds**, sliding left to right, with dot indicators and
  prev/next arrows for manual control — it pauses while a reader's mouse or
  keyboard focus is on it, and skips the sliding animation for anyone with
  "reduce motion" turned on at the OS level.
- **Crop & zoom for every photo, before it's attached — including a fully
  freeform crop** — picking a cover photo or inserting a photo into the
  story (on both `/submit` and when editing) opens a quick crop step first.
  The cover photo is locked to the same wide ratio it's always displayed at
  across the site (drag to reposition, slider to zoom), so what's framed in
  the tool is exactly what shows up — no more surprise cropping from the
  browser's CSS. Inline story photos get Original/Wide/Square frame presets
  *plus* a **Freeform** mode: the whole photo is shown at once with a
  draggable, corner-and-edge-resizable rectangle, so a contributor can crop
  to literally any shape or region, not just the three fixed ratios. Either
  way, "Use this crop" (or "Use original, skip crop" to bypass it entirely)
  finishes the step. Built from scratch with plain `<canvas>` (no crop
  library was installable in this sandbox); it's a client-side enhancement
  on top of the existing server-side resize, so anything not explicitly
  cropped still gets automatically shrunk to fit as before — this doesn't
  remove or change that safety net, it just gives the author a say before
  it kicks in. Photos can be up to **50MB** each, and are kept at up to
  **3000px wide** (cover) / **2600px** (inline) — noticeably sharper than a
  typical web-optimized image, while still keeping page weight sane.
- **Accounts gate engagement, not reading or submitting** — anyone can read
  every published story and submit new ones anonymously; liking, commenting
  and sharing all require a free account (`/account/signup`).
- **My Stories** (`/account/my-stories`, signed-in only) — everything a person
  has submitted while logged in, in one place: status (pending / live /
  declined), view count, like count, comment count, and a best-effort share
  count (counted when someone clicks a share option, since there's no way to
  confirm they followed through), plus an **Edit story** button on each card.
  Editing reopens the same rich editor pre-loaded with the story's existing
  text and photos — photos already in the story show inline exactly where
  they were placed and can be removed with their ×; any photos not placed
  inline are managed as a small checklist below the editor. Saving an edit
  always re-enters the review queue: if the story was live, it's unpublished
  until an editor re-approves the change, so nothing goes out unreviewed.
  Only the story's own author can edit it (checked server-side); note that a
  story only ends up here if it was submitted while signed in — anonymous
  submissions have no owner to attach it to.
- **Search, category, and location browsing at `/blog`** — a search box
  (matches title/summary/body/location), a category filter (sidebar links),
  a location filter (dropdown of every location currently in use by a
  published story), and a **Sort by** dropdown (Newest first, Most liked,
  Title A–Z, Location A–Z). All four combine and stay in the URL, so a
  filtered/sorted view is bookmarkable and shareable.
- **Hand-generated vintage-travel-poster cover art** for the 9 seeded stories
  and the homepage hero — made with Pillow, no stock photography needed
  (see `scripts/generate_covers.py` / `generate_brand.py` if you want to
  regenerate or tweak the style).
- **Story bodies are stored as real, sanitized HTML** (not markdown-lite
  text) so the font controls above actually work — a `<span
  style="font-family/font-size">` an author sets in the editor is what gets
  saved and rendered. Safety comes from an allowlist HTML sanitizer run on
  every submission at *save* time (hand-written against Python's stdlib
  `html.parser`, since no sanitizer library like `bleach`/`nh3` was
  installable in this sandbox): only a small fixed set of tags survive
  (`p`, `b`/`strong`, `i`/`em`, lists, `span`), and the only attribute kept
  anywhere is a `style` on `span` — and even then, only `font-family` /
  `font-size` declarations with a safe-looking value survive; everything
  else (scripts, event handlers, links, arbitrary CSS) is stripped or
  unwrapped. The no-JavaScript fallback textarea still accepts typed
  `**bold**`, `*italic*`, `- lists` and is converted the same safe way.
- Lightweight session-based CSRF protection on every form, password hashing
  via Werkzeug, image upload validation + automatic resizing via Pillow.
  Every photo (cover or gallery) is capped at 50MB and validated as a real
  image before it's saved; the whole submit request is capped at 500MB so a
  handful of full-resolution photos always fits.

## Project structure

```
app/
  __init__.py     Flask app factory, config, blueprint registration
  db.py           SQLite connection handling + `flask init-db` CLI command
  auth.py         signup / login / logout
  blog.py         home, listing, story detail, like, comment, submit, about
  admin.py        review queue, approve / decline / unpublish, all-posts table
  utils.py        auth decorators, CSRF helpers, slugify, image upload/resizing
templates/        Jinja2 templates (one per page)
static/css/style.css   the entire design system (vintage travel palette)
static/js/main.js      mobile nav, like button (progressive AJAX), share menu
static/img/, static/uploads/   generated brand art + story cover images
scripts/generate_covers.py, generate_brand.py, generate_gallery.py   asset generation
scripts/screenshot.js, demo_*.js   Playwright QA / demo-walkthrough tooling
schema.sql        database schema
seed.py           demo data loader
run.py            entry point
render.yaml       Render Blueprint — one-click deploy config (see below)
```

## Design

Palette and type are built around a "vintage travel poster meets premium
travel magazine" feel: warm cream/parchment background, terracotta + mustard
+ deep teal accents, **Lora** for headings and a handwritten **Caveat** for
the tagline, **Poppins** for UI/body text (all loaded from Google Fonts).
Cover art uses flat mid-century-poster-style illustration (gradients, sun,
mountains/coast/desert/skyline silhouettes, a postmark-style stamp) generated
locally with Pillow rather than stock photography.

## Deploying to Render (Starter + Persistent Disk, ~$7–8/month)

This app is deploy-ready for Render out of the box: `render.yaml` describes
the whole service, `gunicorn` is in `requirements.txt`, and the database
path / photo-upload folder are both configurable via environment variables
(`DATABASE_PATH`, `UPLOAD_FOLDER`) so they can point at a persistent disk
instead of the app's own folder — necessary because Render's plain
container filesystem is wiped on every deploy/restart/spin-down, which
would otherwise erase the database and every uploaded photo. The free plan
can't attach a persistent disk at all, which is why this needs the paid
**Starter** plan ($7/month) plus a small **Persistent Disk**
(~$0.25/GB/month — 1GB is plenty to start).

**1. Push this project to GitHub.** If you don't already have a repo:
   ```bash
   cd voyage-journal
   git init                          # skip if already a git repo
   git add -A
   git commit -m "Initial commit"
   ```
   Create an empty repo on GitHub (github.com → New repository — don't
   initialize it with a README), then:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```

**2. Create a Render account** at [render.com](https://render.com) if you
   don't have one, and connect your GitHub account when prompted.

**3. Create the service from the Blueprint.** In the Render dashboard:
   New → Blueprint → select the repo you just pushed. Render reads
   `render.yaml` from the repo root and pre-fills everything: a Starter
   web service, a 1GB persistent disk mounted at `/var/data`, the build
   command (`pip install -r requirements.txt`), the start command
   (`gunicorn run:app`), and a securely auto-generated `SECRET_KEY`. Review
   it and click **Apply**.

   (No Blueprint option, or prefer doing it by hand? New → Web Service →
   pick the repo → set Build Command to `pip install -r requirements.txt`
   and Start Command to `gunicorn run:app` → choose the **Starter** plan →
   under **Disks**, add one mounted at `/var/data` with 1GB → under
   **Environment**, add `SECRET_KEY` (generate a random value),
   `DATABASE_PATH` = `/var/data/voyage_journal.db`, and `UPLOAD_FOLDER` =
   `/var/data/uploads`.)

**4. Wait for the first deploy to finish** (a few minutes — watch the
   Logs tab). The app creates its own database tables automatically on
   first boot against the empty disk, so the site is live and working as
   soon as the deploy succeeds — just with no stories in it yet.

**5. Create your admin account.** Sign up for a normal account on the live
   site (`/account/signup`), then promote it to admin. On Render, open your
   service → **Shell** tab (available on paid plans) and run:
   ```bash
   python3 -c "
   from app import create_app
   from app.db import get_db
   app = create_app()
   with app.app_context():
       db = get_db()
       db.execute(\"UPDATE users SET role='admin' WHERE email=?\", ('you@example.com',))
       db.commit()
   "
   ```
   (replace the email with the one you signed up with). This is
   deliberately separate from the demo `seed.py` script, which creates a
   well-known admin login (`admin@voyagejournal.com` / `AdminDemo123`) —
   fine for trying the app out, but don't rely on that account for a real
   public site. If you do run `python3 seed.py` via the Shell to load the
   demo content as a starting point, change or delete that admin account's
   password immediately after.

**6. (Optional) Point a custom domain at it** — Render → your service →
   Settings → Custom Domains, then add the CNAME/A record your domain
   registrar gives you.

From then on: push to your `main` branch (or ask me to, once I have push
access to the repo) and Render redeploys automatically — the database and
every uploaded photo persist across deploys since they live on the
mounted disk, not in the app's own folder.

## Other things worth doing before a real public launch

1. Consider adding email verification on signup and rate-limiting on
   `/submit` and `/account/login` if it'll be open to the public internet.
2. Back up the database on the persistent disk regularly (Render's Shell
   can copy `/var/data/voyage_journal.db` out, or move to a hosted
   Postgres database if you expect meaningful traffic/concurrent writes —
   SQLite is genuinely fine for a blog at moderate traffic, just not
   built for many simultaneous writers).

## A note on how this was built

This was built inside a sandboxed environment where package registries
(npm, PyPI) were network-blocked, so a Next.js/Prisma build wasn't possible.
Flask + SQLite were chosen instead specifically because they ship with a
standard Python install and needed zero package downloads — the app you have
is fully real and functional, just Python instead of JavaScript on the
backend. If you'd like this rebuilt on Next.js/React/Postgres (or any other
stack) that's a very doable follow-up.
