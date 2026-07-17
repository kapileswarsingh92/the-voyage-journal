process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/delete_test";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();

  // auto-accept the native confirm() dialog and log its message
  page.on("dialog", async (dialog) => {
    console.log("CONFIRM DIALOG:", dialog.message());
    await dialog.accept();
  });

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  // 1. Delete a LIVE post (Santorini) from /admin/posts, capture files-before
  await page.goto(BASE + "/admin/posts?status=approved", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/1-before-delete.png`, fullPage: true });

  const row = page.locator('tr:has-text("Chasing Blue Domes")').first();
  await row.waitFor({ timeout: 5000 });
  await row.locator('button:has-text("Delete")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/2-after-delete.png`, fullPage: true });

  const flash = await page.locator(".flash").first().textContent().catch(() => null);
  console.log("Flash after delete:", flash);

  // confirm the live URL now 404s
  const res = await page.goto(BASE + "/blog/chasing-blue-domes-three-days-in-santorini", { waitUntil: "domcontentloaded" });
  console.log("Live URL status after delete:", res.status());

  // 2. Delete a PENDING post directly from the dashboard queue
  await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const pendingCountBefore = await page.locator(".admin-item").count();
  console.log("Pending items before:", pendingCountBefore);
  const firstDeleteBtn = page.locator(".admin-item").first().locator('button:has-text("Delete")');
  await firstDeleteBtn.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);
  const pendingCountAfter = await page.locator(".admin-item").count();
  console.log("Pending items after:", pendingCountAfter);

  // 3. Reject a post then delete it (rejected status)
  await page.goto(BASE + "/admin/posts?status=rejected", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const rejectedRows = await page.locator("tbody tr").count();
  console.log("Rejected rows found:", rejectedRows);

  await browser.close();
})();
