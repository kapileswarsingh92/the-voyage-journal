process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/preview_test";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1200 } })).newPage();

  const slug = "five-coffee-rituals-i-learned-to-slow-down-for"; // pending seed post, owned by reader (user 2)

  // 1. Non-admin logged-in user (the story's own owner) tries to view the pending post directly -> should 404
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  let res = await page.goto(BASE + "/blog/" + slug, { waitUntil: "domcontentloaded" });
  console.log("Owner (non-admin) view of own pending post:", res.status());
  await page.goto(BASE + "/account/logout", { waitUntil: "domcontentloaded" });

  // 2. Log in as admin
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  // 3. Preview the pending post, decline it from the banner
  await page.goto(BASE + "/blog/" + slug, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  let bannerText = await page.locator(".admin-preview-banner").textContent();
  console.log("Pending preview banner:", bannerText.replace(/\s+/g, " ").trim());

  await page.locator(".admin-preview-actions summary:has-text('Decline')").click();
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/3-decline-dropdown-open.png`, fullPage: true });
  await page.fill(".reject-form textarea[name='note']", "Needs more detail on the coffee rituals themselves.");
  await page.locator(".reject-form button:has-text('Confirm decline')").click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/4-after-decline.png`, fullPage: true });

  // 4. Now the post is rejected — reload the preview and check the rejected UI
  await page.goto(BASE + "/blog/" + slug, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  bannerText = await page.locator(".admin-preview-banner").textContent();
  console.log("Rejected preview banner:", bannerText.replace(/\s+/g, " ").trim());
  const declineButtonCount = await page.locator(".admin-preview-actions summary:has-text('Decline')").count();
  console.log("Decline button present on rejected preview (should be 0):", declineButtonCount);
  const approveButtonCount = await page.locator(".admin-preview-actions button:has-text('Approve')").count();
  console.log("Approve button present on rejected preview (should be 1):", approveButtonCount);
  await page.screenshot({ path: `${OUT}/5-rejected-preview.png`, fullPage: true });

  // 5. Confirm anonymous still 404s on the now-rejected post
  await page.goto(BASE + "/account/logout", { waitUntil: "domcontentloaded" });
  res = await page.goto(BASE + "/blog/" + slug, { waitUntil: "domcontentloaded" });
  console.log("Anonymous view of rejected post:", res.status());

  // 6. Sanity-check the share-menu CSS fix: on a normal live post, the share
  // menu must be closed (not visible) until the toggle is clicked.
  await page.goto(BASE + "/blog/chasing-blue-domes-three-days-in-santorini", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  const shareMenuVisibleBefore = await page.locator(".share-menu").isVisible().catch(() => false);
  console.log("Share menu visible before toggle click (should be false):", shareMenuVisibleBefore);
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.goto(BASE + "/blog/chasing-blue-domes-three-days-in-santorini", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  const shareMenuVisibleLoggedIn = await page.locator(".share-menu").isVisible().catch(() => false);
  console.log("Share menu visible before toggle click, logged in (should be false):", shareMenuVisibleLoggedIn);
  await page.click("[data-share-toggle]");
  await page.waitForTimeout(150);
  const shareMenuVisibleAfterToggle = await page.locator(".share-menu").isVisible().catch(() => false);
  console.log("Share menu visible after toggle click (should be true):", shareMenuVisibleAfterToggle);

  await browser.close();
})();
