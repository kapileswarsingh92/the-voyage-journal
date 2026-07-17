process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/preview_test";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const pendingCount = await page.locator(".admin-item").count();
  console.log("Pending items in admin dashboard (should be 2):", pendingCount);
  await page.screenshot({ path: `${OUT}/final-admin-dashboard.png`, fullPage: true });

  await page.goto(BASE + "/blog", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const cardCount = await page.locator(".post-card").count();
  console.log("Approved cards on /blog (should be 9):", cardCount);
  await page.screenshot({ path: `${OUT}/final-blog-list.png`, fullPage: true });

  await browser.close();
})();
