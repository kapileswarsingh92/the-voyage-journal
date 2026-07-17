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
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/admin/posts?status=pending", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const row = page.locator('tr:has-text("Ten Days of Doing Very Little in Bali")').first();
  await row.waitFor({ timeout: 5000 });
  await row.locator('button:has-text("Approve")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);

  await page.goto(BASE + "/blog/ten-days-of-doing-very-little-in-bali", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/6-republished.png`, fullPage: true });
  console.log("republished ok, status:", (await page.title()));

  await browser.close();
})();
