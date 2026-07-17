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

  // 1. Anonymous user tries to view a pending post directly -> should 404
  const slug = "notes-from-a-night-train-through-the-balkans"; // pending seed post
  let res = await page.goto(BASE + "/blog/" + slug, { waitUntil: "domcontentloaded" });
  console.log("Anonymous view of pending post:", res.status());

  // 2. Log in as admin, go to dashboard, click the pending post's title
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const titleLink = page.locator(".admin-item h3 a").first();
  const titleText = await titleLink.textContent();
  console.log("Clicking pending title:", titleText);
  await titleLink.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/1-admin-preview-pending.png`, fullPage: true });

  const bannerText = await page.locator(".admin-preview-banner").textContent();
  console.log("Banner text:", bannerText.replace(/\s+/g, " ").trim());
  const hasEngagement = await page.locator("#engage").count();
  console.log("Engagement actions present (should be 0):", hasEngagement);
  const hasNote = await page.locator(".preview-engagement-note").count();
  console.log("Preview note present (should be 1):", hasNote);

  // 3. Approve directly from the preview banner
  await page.locator(".admin-preview-actions button:has-text('Approve')").click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/2-after-approve-from-preview.png`, fullPage: true });
  const bannerGone = await page.locator(".admin-preview-banner").count();
  console.log("Banner gone after approve (should be 0):", bannerGone);
  const engagementNow = await page.locator("#engage").count();
  console.log("Engagement actions now present (should be 1):", engagementNow);

  // 4. Now that it's live, verify a logged-out visitor CAN see it
  await page.goto(BASE + "/account/logout", { waitUntil: "domcontentloaded" });
  res = await page.goto(BASE + "/blog/" + slug, { waitUntil: "domcontentloaded" });
  console.log("Anonymous view after approval:", res.status());

  await browser.close();
})();
