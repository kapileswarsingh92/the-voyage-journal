"""
Seeds the database with an admin account, a demo reader account, a set of
approved stories (with generated cover art), a couple of pending submissions
for the admin queue demo, and a few likes/comments for realism.

Run: python3 seed.py
"""
from werkzeug.security import generate_password_hash

from app import create_app
from app.db import get_db, init_db
from app.blog import plain_excerpt
from app.utils import slugify

ADMIN = {"name": "Journal Admin", "email": "admin@voyagejournal.com", "password": "AdminDemo123"}
DEMO_READER = {"name": "Maya Chen", "email": "reader@voyagejournal.com", "password": "ReaderDemo123"}

POSTS = [
    dict(
        title="Chasing Blue Domes: Three Days in Santorini",
        category="Travel",
        location="Santorini, Greece",
        author_name="Elena Papadaki",
        cover_image="seed-santorini.jpg",
        gallery=["gallery-santorini-1.jpg", "gallery-santorini-2.jpg", "gallery-santorini-3.jpg"],
        content="""There's a particular kind of quiet that settles over Oia in the hour before sunset, when the day-trippers start filing back toward the cable car and the caldera light turns everything the colour of a ripe apricot. I'd come to Santorini expecting postcards. I left with something closer to a rhythm.

Mornings belonged to the villages that don't make it onto the postcards — Pyrgos, with its Venetian castle ruins and grandmothers selling capers from folding tables, or Emporio, where the streets fold in on themselves like a labyrinth built to confuse pirates (it was). I'd walk with no destination, get pleasantly lost, and find lunch wherever the smell of grilled octopus led me.

**The wine surprised me most.** Santorini's vines are trained low, coiled into basket shapes called *kouloura* that shield the grapes from the relentless wind. The volcanic soil gives the Assyrtiko a mineral, almost briny snap I hadn't tasted anywhere else. I spent an entire golden-hour at a winery in Megalochori, learning this, mostly by accident.

- Skip the sunset crowds in Oia — watch it instead from Firostefani, ten minutes' walk and a fraction of the people
- Rent a quad, not a car — the roads are narrow and the parking is worse
- Eat at the places without English menus first

By the third evening I'd stopped photographing the sunset altogether. Some things are worth just standing still for.""",
    ),
    dict(
        title="What Kyoto's Temples Taught Me About Silence",
        category="Culture",
        location="Kyoto, Japan",
        author_name="Daniel Okafor",
        cover_image="seed-kyoto.jpg",
        gallery=["gallery-kyoto-1.jpg", "gallery-kyoto-2.jpg", "gallery-kyoto-3.jpg"],
        content="""I arrived in Kyoto with a list. Fushimi Inari at dawn, Kinkaku-ji by ten, Arashiyama's bamboo grove before the tour buses. By day two I'd abandoned it entirely.

[[photo:1]]

It happened at Ryoan-ji, in front of the rock garden — fifteen stones arranged on raked gravel, and famously, no matter where you stand, you can only ever see fourteen. I sat on the wooden veranda for what I told myself would be five minutes. It was closer to an hour. Nobody around me seemed to be in a hurry either, which I found, at first, mildly infuriating, and then, quietly, the entire point.

**Kyoto doesn't perform for you.** The city's two thousand temples aren't attractions so much as they are still-functioning parts of daily life — a monk sweeping leaves, a schoolgirl bowing at a small roadside shrine on her way home. You're welcome to watch, but nothing is staged for the watching.

[[photo:2]]

A few things worth knowing before you go:

1. Buy a Kyoto city bus pass — the subway looks efficient but the buses actually get you everywhere
2. Visit Fushimi Inari at 6am; by 9am the thousand red gates are a very different kind of crowded
3. Book a seat at a counter-style restaurant at least once — watching a meal being made is half of what makes it good

[[photo:3]]

I left without ever making it to the bamboo grove. I don't think I minded.""",
    ),
    dict(
        title="Wind, Ice, and Very Good Bread: Hiking Patagonia",
        category="Adventure",
        location="El Chaltén, Argentina",
        author_name="Sofia Reyes",
        cover_image="seed-patagonia.jpg",
        content="""The wind in Patagonia doesn't so much blow as *argue* with you. Locals in El Chaltén warn newcomers about it the way you'd warn someone about a temperamental dog — respect it, don't turn your back on it, and for the love of god hold onto your hat.

We'd come for Laguna de los Tres, the trek to the base of Mount Fitz Roy, an out-and-back that clocks in around 20km depending on how many times you stop to stare (a lot, in our case). The first three hours are gentle, forest and river crossings and guanacos watching you from a polite distance. The final climb is a different story — a scramble up loose scree with the wind trying actively to unseat you, and then, all at once, the lake and the granite spires appear like the mountain had been holding its breath.

**We didn't see the peak clearly until we were nearly back down.** Fitz Roy makes its own weather, and most days it hides behind cloud out of what I choose to believe is modesty. When it finally cleared, for maybe four minutes, everyone on that ridge went completely silent.

Practical notes for anyone attempting it:

- Start before 7am — the wind gets worse, not better, as the day goes on
- El Chaltén's bakeries are absurdly good; buy more bread than you think you need
- Layers over waterproofs — it can be four seasons in one afternoon

Patagonia doesn't care if you came prepared. It rewards you anyway, occasionally, when it feels like it.""",
    ),
    dict(
        title="Getting Lost (On Purpose) in the Marrakech Medina",
        category="Culture",
        location="Marrakech, Morocco",
        author_name="Yusuf Amrani",
        cover_image="seed-marrakech.jpg",
        content="""No map works in the Marrakech medina, and after the second day I stopped trying to make one work. The alleys twist back on themselves by design — a defensive layout centuries old — and the only reliable strategy is to let a wrong turn become the plan.

That's how I found the dyers' souk, quite by accident, wool hung in skeins the colour of saffron and pomegranate drying between buildings so close the sky reduces to a blue seam. A man named Hassan, noticing me noticing, waved me in, poured mint tea before I'd said a word, and spent twenty minutes explaining the difference between natural and synthetic indigo with the patience of someone who's had this exact conversation five hundred times and still means it.

**Bargaining here isn't a chore, it's a conversation**, and treating it like a hostile transaction gets you nowhere good. Start at half the quoted price, expect to land around two-thirds, and accept the tea that's offered — refusing it is the real faux pas.

A short list, hard-won:

- The main square, Jemaa el-Fnaa, is a completely different place at 4pm versus 9pm — go both times
- Riads (not hotels) for where you sleep — the quiet courtyards are the whole point
- Hammams are not optional. Book a proper scrub, not the tourist-lite version

By the end of the week, I could find my way back to the riad without help. I'm still not sure how.""",
    ),
    dict(
        title="A Slow Weekend in Lisbon's Alfama",
        category="Lifestyle",
        location="Lisbon, Portugal",
        author_name="Marta Silva",
        cover_image="seed-lisbon.jpg",
        content="""Alfama survived the 1755 earthquake that flattened most of Lisbon, and it shows — this is a neighbourhood built for people, not cars, all steep cobbled lanes and laundry strung between balconies close enough to touch. I stayed three nights and never once needed a taxi.

Mornings started at a tiny counter near Miradouro das Portas do Sol, a *pastel de nata* still warm enough to fog the little paper bag, coffee strong enough to argue with. From there it's all downhill, literally — Alfama rewards wandering downward and regrets are reserved for the walk back up.

**Fado found me before I found it.** On the second night, drawn by a sound leaking out of an unmarked doorway, I ended up in a twelve-seat tasca listening to an elderly woman sing something that needed no translation to land. Nobody spoke while she performed. Nobody clapped between songs either — apparently that's tradition, not rudeness.

If you're planning a slow weekend here:

- Skip the tram 28 queue and just walk the route instead — same views, none of the wait
- Eat dinner late, Lisbon doesn't get going until 9pm
- The best miradouros (viewpoints) aren't the famous ones — ask a local, they'll have a favourite

I came for the tiles and the light. I left thinking mostly about the singing.""",
    ),
    dict(
        title="Ten Days of Doing Very Little in Bali",
        category="Wellness",
        location="Ubud, Bali",
        author_name="Priya Nair",
        cover_image="seed-bali.jpg",
        gallery=["gallery-bali-1.jpg", "gallery-bali-2.jpg"],
        content="""I went to Bali with a vague plan to "reset," which in practice meant I spent the first two days still checking my phone at rice-terrace viewpoints, mildly ashamed of myself. It took until day four for that to actually stop.

Ubud in the early morning is worth setting an alarm for — mist still sitting low over the Tegallalang terraces, the sound of temple bells somewhere you can't quite place, a version of quiet that's hard to find at home. I started each day with a short walk before the heat set in, no destination, just rice paddies and the occasional very confident rooster.

[[photo:1]]

**The food changed how I think about a meal.** A warung near my homestay served nasi campur — a little of everything, vegetables and tempeh and sambal so bright it startled me the first bite — for less than the price of a coffee back home, and it remains one of the best things I've eaten anywhere.

[[photo:2]]

A few things that made the trip:

- A half-day at a subak (traditional irrigation) village explained more about Bali than any museum could
- Skip the swing photo spots — the queues aren't worth it, the rice terraces themselves are free and quieter
- Book one real yoga class with an actual teacher, not just a scenic Instagram session

I didn't come back "reset" exactly. I came back having remembered what unhurried feels like, which might be the same thing.""",
    ),
    dict(
        title="Olive Oil, Sunday Lunches, and the Slowness of Tuscany",
        category="Food & Drink",
        location="Val d'Orcia, Tuscany",
        author_name="Giulia Conti",
        cover_image="seed-tuscany.jpg",
        content="""My grandmother's family is from a village outside Montalcino, and I'd heard about Sunday lunch there my entire life before I finally sat at that actual table. It ran four hours. Nobody seemed to think that was long.

Val d'Orcia in early autumn is somewhere between a painting and a cliché, all cypress-lined roads and hills the colour of toasted bread, but staying with family instead of in a hotel changes what the region is actually *for*. It's not a backdrop. It's where people grow olives, press their own oil in November, and argue cheerfully about whether this year's batch is peppery enough.

**We picked olives by hand off nets laid under the trees**, which is slower and more back-breaking than I expected, and then watched them get pressed the same afternoon at a communal frantoio down the road — cold-pressed oil so fresh and green it tasted almost like grass, nothing like what comes in a bottle.

If you're lucky enough to get invited to a table like this:

- Say yes to everything offered, but pace yourself — there will be five courses
- Bring wine, not flowers, and let it be local
- Ask about the olive harvest if it's autumn; everyone has an opinion and most love sharing it

I flew home with two litres of unlabelled olive oil in my suitcase, wrapped in every sweater I owned. Worth every worried glance at check-in.""",
    ),
    dict(
        title="New York in the Cracks: A Local's Off-Hours Guide",
        category="Lifestyle",
        location="New York City, USA",
        author_name="Jordan Blake",
        cover_image="seed-newyork.jpg",
        content="""Everyone who visits New York gets the same five landmarks and, honestly, they're famous for a reason. But after eight years here, the city I actually love lives in its in-between hours — the ones before the crowds show up and after they've gone home.

**6am in Central Park** belongs to dog walkers, early runners, and almost nobody else. The Sheep Meadow at that hour is close to silent, which if you've only seen it in July at 2pm is nearly impossible to imagine. Walk the Reservoir loop before the light gets harsh and the skyline reflection is worth the early alarm alone.

Late nights are where the neighbourhoods actually show themselves. A diner in the East Village that's been open since 1972, still serving the same egg cream. A record shop in Greenpoint that doesn't open until the owner feels like it, some days not at all. These aren't secrets exactly — they're just easy to miss if your itinerary is built entirely around what's famous.

A short, honest list:

- The Staten Island Ferry is free, runs 24 hours, and gives you the skyline view everyone pays for elsewhere
- Go to a neighbourhood you have zero reason to visit and just walk it for an hour
- Eat where the line is entirely local, not entirely tourists

New York rewards curiosity more than it rewards a checklist. Slow down slightly and it opens up considerably.""",
    ),
    dict(
        title="Above the Tree Line: A Beginner's Alpine Traverse",
        category="Adventure",
        location="Zermatt, Switzerland",
        author_name="Lukas Meier",
        cover_image="seed-swissalps.jpg",
        content="""I am, by most definitions, not a serious mountaineer, which made the decision to attempt a two-day alpine traverse near Zermatt either brave or reckless depending on who in my family you ask. In hindsight: a bit of both, and worth every aching step.

We started from Zermatt itself, cable car to Gornergrat to save the legs for what mattered, then on foot toward the Monte Rosa hut with the Matterhorn doing its best impression of a postcard the entire way. The air thins faster than you expect and conversation thins with it — by the final hour before the hut, nobody was talking much, just walking, watching the light change on the glacier below.

**Mountain huts are their own small society.** Communal bunk rooms, dinner at a long shared table, an unspoken rule that lights-out means lights-out because everyone's leaving before dawn. We were up at 4:30am for the second day's crossing, headlamps bobbing across the snowfield in a loose line of strangers who'd become, briefly, a team.

If you're an ambitious beginner considering something similar:

- Hire a mountain guide — this isn't the trip to learn crevasse rescue on the fly
- Break in your boots for weeks beforehand, not days
- Budget more time than you think for the altitude; rushing it ruins the trip and can be genuinely dangerous

We reached the ridge at sunrise on day two, the Matterhorn lit orange below us instead of above. I've been chasing that particular kind of tired ever since.""",
    ),
]

PENDING_POSTS = [
    dict(
        title="Notes from a Night Train Through the Balkans",
        category="Travel",
        location="Belgrade to Sofia",
        author_name="Ana Petrović",
        author_email="ana.p@example.com",
        content="""There's something about a night train that a flight can never replicate — the slow unspooling of a landscape instead of the abrupt teleportation of air travel. I boarded in Belgrade with a cabin to myself and a paper timetable that turned out to be more of a suggestion.

We crossed the border somewhere around 2am, a bored guard flipping through passports by flashlight while half-asleep. I woke properly around six to hills I couldn't name yet, coffee from a battered trolley, and a conductor who insisted, in three languages, that I was going to love Sofia.

He wasn't wrong. But that's a different story — this one's about the eleven hours in between, which turned out to be the part I keep thinking about.""",
    ),
    dict(
        title="Five Coffee Rituals I Learned to Slow Down For",
        category="Lifestyle",
        location="Vienna, Austria",
        author_name="Tom Richter",
        author_email="tom.r@example.com",
        content="""Viennese coffee houses operate on a principle that took me an embarrassingly long time to accept: the table is yours for as long as you want it, one small coffee and a glass of water included, no pressure to order more or leave sooner.

I spent a week testing this theory across five different Kaffeehäuser, notebook in hand, mostly as an excuse to sit still for once. Here's what stuck with me long after I flew home, and what I've clumsily tried to rebuild in my own kitchen since — with mixed, but earnest, results.""",
    ),
]

COMMENTS_SEED = [
    ("Chasing Blue Domes: Three Days in Santorini", "This makes me want to book a flight right now. The bit about the kouloura vines is fascinating."),
    ("What Kyoto's Temples Taught Me About Silence", "Ryoan-ji did the exact same thing to me. Hard to explain to people who haven't sat there."),
    ("Ten Days of Doing Very Little in Bali", "Needed this reminder today. Saving this for my next trip."),
]


def run():
    app = create_app()
    with app.app_context():
        init_db()
        db = get_db()

        admin_hash = generate_password_hash(ADMIN["password"])
        db.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')",
            (ADMIN["name"], ADMIN["email"], admin_hash),
        )
        reader_hash = generate_password_hash(DEMO_READER["password"])
        db.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')",
            (DEMO_READER["name"], DEMO_READER["email"], reader_hash),
        )
        db.commit()

        reader_id = db.execute(
            "SELECT id FROM users WHERE email = ?", (DEMO_READER["email"],)
        ).fetchone()["id"]

        for post in POSTS:
            slug = slugify(post["title"])
            excerpt = plain_excerpt(post["content"].split("\n\n")[0])
            cur = db.execute(
                """INSERT INTO posts
                   (title, slug, excerpt, content, cover_image, category, location,
                    author_name, author_email, status, created_at, approved_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', datetime('now', ?), datetime('now', ?))""",
                (
                    post["title"], slug, excerpt, post["content"], post["cover_image"],
                    post["category"], post["location"], post["author_name"], None,
                    f"-{POSTS.index(post) + 2} days", f"-{POSTS.index(post) + 1} days",
                ),
            )
            post_id = cur.lastrowid
            for i, fname in enumerate(post.get("gallery", [])):
                db.execute(
                    "INSERT INTO post_images (post_id, filename, position) VALUES (?, ?, ?)",
                    (post_id, fname, i),
                )
        db.commit()

        # Pin two demo posts to showcase the homepage Featured carousel out
        # of the box. Deliberately *not* the most recently-approved post
        # (Santorini) — picking older ones demonstrates that a pinned post
        # stays featured regardless of its age, which is the whole point of
        # pinning.
        pinned_titles_newest_pin_first = [
            "A Slow Weekend in Lisbon's Alfama",
            "Above the Tree Line: A Beginner's Alpine Traverse",
        ]
        for i, title in enumerate(pinned_titles_newest_pin_first):
            db.execute(
                "UPDATE posts SET pinned = 1, pinned_at = datetime('now', ?) WHERE title = ?",
                (f"-{i} hours", title),
            )
        db.commit()

        for post in PENDING_POSTS:
            slug = slugify(post["title"])
            excerpt = plain_excerpt(post["content"].split("\n\n")[0])
            db.execute(
                """INSERT INTO posts
                   (title, slug, excerpt, content, category, location,
                    author_name, author_email, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')""",
                (
                    post["title"], slug, excerpt, post["content"], post["category"],
                    post["location"], post["author_name"], post["author_email"],
                ),
            )
        db.commit()

        # a handful of likes from the demo reader
        liked_titles = [
            "Chasing Blue Domes: Three Days in Santorini",
            "What Kyoto's Temples Taught Me About Silence",
            "Ten Days of Doing Very Little in Bali",
            "Above the Tree Line: A Beginner's Alpine Traverse",
        ]
        for title in liked_titles:
            pid = db.execute("SELECT id FROM posts WHERE title = ?", (title,)).fetchone()["id"]
            db.execute("INSERT OR IGNORE INTO likes (post_id, user_id) VALUES (?, ?)", (pid, reader_id))

        for title, comment in COMMENTS_SEED:
            pid = db.execute("SELECT id FROM posts WHERE title = ?", (title,)).fetchone()["id"]
            db.execute(
                "INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)",
                (pid, reader_id, comment),
            )
        db.commit()

        # Link a couple of demo stories to the reader account (one live, one
        # still pending) so "My Stories" has something real to show, with
        # some view/share numbers on the published one for a realistic demo.
        db.execute(
            "UPDATE posts SET submitted_by_user_id = ?, view_count = 482, share_count = 9 WHERE title = ?",
            (reader_id, "Ten Days of Doing Very Little in Bali"),
        )
        db.execute(
            "UPDATE posts SET submitted_by_user_id = ? WHERE title = ?",
            (reader_id, "Five Coffee Rituals I Learned to Slow Down For"),
        )
        db.commit()

        print("Seeded database:")
        print(f"  Admin login   -> {ADMIN['email']} / {ADMIN['password']}")
        print(f"  Reader login  -> {DEMO_READER['email']} / {DEMO_READER['password']}")
        print(f"  {len(POSTS)} approved posts, {len(PENDING_POSTS)} pending posts")
        print(f"  {len(pinned_titles_newest_pin_first)} posts pinned to the homepage Featured carousel")


if __name__ == "__main__":
    run()
