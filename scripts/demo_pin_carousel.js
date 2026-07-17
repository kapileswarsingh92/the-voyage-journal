process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/pin_test";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();

  // 1. Anonymous homepage: two seeded pinned posts should be in the Featured carousel.
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  let slideCount = await page.locator(".feature-slide").count();
  console.log("Seeded featured slides (should be 2):", slideCount);
  let firstSlideTitle = await page.locator(".feature-slide").nth(0).locator("h3").textContent();
  console.log("First slide (should be the more-recently-pinned Lisbon post):", firstSlideTitle.trim());
  let dotCount = await page.locator("[data-feature-dot]").count();
  console.log("Dot indicators (should be 2):", dotCount);
  await page.screenshot({ path: `${OUT}/1-homepage-carousel.png`, fullPage: true });

  // Santorini is the most-recently-approved post but NOT pinned — it should
  // NOT be the featured slide (proves pinning overrides recency), and it
  // should still show up in "Latest stories" instead.
  const featuredTitles = await page.locator(".feature-slide h3").allTextContents();
  console.log("Featured titles:", featuredTitles.map((t) => t.trim()));
  const latestTitles = await page.locator(".post-card h3").allTextContents();
  console.log("Santorini in Latest stories (should be true):", latestTitles.some((t) => t.includes("Santorini")));
  console.log("Santorini NOT in Featured (should be true):", !featuredTitles.some((t) => t.includes("Santorini")));

  // 2. Manual dot navigation.
  await page.locator('[data-feature-dot="1"]').click();
  await page.waitForTimeout(200);
  let activeDot = await page.locator(".feature-dot.is-active").getAttribute("data-feature-dot");
  console.log("Active dot after clicking dot 1 (should be 1):", activeDot);
  let secondSlideTitle = await page.locator(".feature-slide").nth(1).locator("h3").textContent();
  console.log("Second slide title (should be Alpine Traverse):", secondSlideTitle.trim());

  // 3. Auto-advance: wait past the interval and confirm the active slide
  // wrapped back around (carousel was on index 1, only 2 slides, so after
  // one auto-advance it should be back on index 0).
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  let indexBefore = await page.evaluate(() => document.querySelector("[data-feature-carousel]").__testCarousel.getIndex());
  console.log("Carousel index right after load (should be 0):", indexBefore);
  await page.waitForTimeout(15600);
  let indexAfter = await page.evaluate(() => document.querySelector("[data-feature-carousel]").__testCarousel.getIndex());
  console.log("Carousel index after ~15.6s with no interaction (should be 1, auto-advanced):", indexAfter);
  await page.screenshot({ path: `${OUT}/2-after-autoadvance.png`, fullPage: true });

  // 4. Hover should pause the auto-advance.
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  await page.hover(".feature-carousel");
  await page.waitForTimeout(15600);
  let indexWhileHovered = await page.evaluate(() => document.querySelector("[data-feature-carousel]").__testCarousel.getIndex());
  console.log("Carousel index after 15.6s while hovered (should stay 0, paused):", indexWhileHovered);

  // 5. Admin: pin/unpin flow on /admin/posts, plus server-side guard against
  // pinning a non-approved post.
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/admin/posts?status=approved", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const pinnedBadgesBefore = await page.locator(".status-pinned").count();
  console.log("Pinned badges in admin table before change (should be 2):", pinnedBadgesBefore);

  // Pin a third post (Santorini) via the admin table.
  const santoriniRow = page.locator("tr", { hasText: "Chasing Blue Domes" });
  await santoriniRow.locator("button:has-text('Pin to homepage')").click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(150);
  const pinnedBadgesAfter = await page.locator(".status-pinned").count();
  console.log("Pinned badges after pinning Santorini (should be 3):", pinnedBadgesAfter);

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const slideCountAfterPin = await page.locator(".feature-slide").count();
  console.log("Homepage featured slides after pinning a 3rd post (should be 3):", slideCountAfterPin);
  const titlesAfterPin = await page.locator(".feature-slide h3").allTextContents();
  console.log("Featured order after pin (newest pin first, should start with Santorini):", titlesAfterPin.map((t) => t.trim()));

  // Unpin Santorini again.
  await page.goto(BASE + "/admin/posts?status=approved", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  await page.locator("tr", { hasText: "Chasing Blue Domes" }).locator("button:has-text('Unpin')").click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(150);
  const pinnedBadgesAfterUnpin = await page.locator(".status-pinned").count();
  console.log("Pinned badges after unpinning Santorini (should be back to 2):", pinnedBadgesAfterUnpin);

  // 6. Unpublishing a pinned post should clear its pin (it's no longer
  // live, so it can't stay featured) and it should drop out of Featured.
  await page.goto(BASE + "/admin/posts?status=approved", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  const lisbonRow = page.locator("tr", { hasText: "A Slow Weekend in Lisbon" });
  await lisbonRow.locator("button:has-text('Unpublish')").click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(150);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const titlesAfterUnpublish = await page.locator(".feature-slide h3").allTextContents();
  console.log("Featured titles after unpublishing a pinned post (Lisbon should be gone):", titlesAfterUnpublish.map((t) => t.trim()));

  // Re-approve Lisbon so we can put the DB back to its pinned demo state on reseed anyway (reseed will fix this regardless).
  await page.goto(BASE + "/admin/posts?status=pending", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  const lisbonPendingRow = page.locator("tr", { hasText: "A Slow Weekend in Lisbon" });
  if (await lisbonPendingRow.count()) {
    await lisbonPendingRow.locator("button:has-text('Approve')").click();
    await page.waitForLoadState("domcontentloaded");
  }

  await browser.close();
})();
