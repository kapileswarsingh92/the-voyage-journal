process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/my_stories";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/blog/chasing-blue-domes-three-days-in-santorini/edit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/7-leftover-manage.png`, fullPage: true });

  const checkboxCount = await page.locator('input[name="remove_leftover_ids"]').count();
  console.log("leftover checkboxes found:", checkboxCount);

  // check the first two boxes for removal, leave the third
  await page.locator('input[name="remove_leftover_ids"]').nth(0).check();
  await page.locator('input[name="remove_leftover_ids"]').nth(1).check();

  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  // approve as admin, then check final gallery count
  await page.goto(BASE + "/account/logout", { waitUntil: "domcontentloaded" });
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/admin/posts?status=pending", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const row = page.locator('tr:has-text("Chasing Blue Domes")').first();
  await row.locator('button:has-text("Approve")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  await page.goto(BASE + "/blog/chasing-blue-domes-three-days-in-santorini", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const galleryThumbCount = await page.locator("[data-post-gallery] [data-gallery-thumb]").count();
  console.log("remaining bottom-gallery photos (expect 1):", galleryThumbCount);
  await page.screenshot({ path: `${OUT}/8-leftover-result.png`, fullPage: true });

  await browser.close();
})();
