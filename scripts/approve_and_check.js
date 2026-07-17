process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/inline_editor";

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
  await page.waitForTimeout(300);

  await page.goto(BASE + "/admin/posts?status=pending", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-admin-queue.png`, fullPage: true });

  const row = page.locator('tr:has-text("Testing The Rich Photo Editor")').first();
  await row.waitFor({ timeout: 5000 });
  await row.locator('button:has-text("Approve")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/6-after-approve.png`, fullPage: true });
  console.log("approved");

  // now view the published story
  await page.goto(BASE + "/blog", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const link = page.locator('a:has-text("Testing The Rich Photo Editor")').first();
  await link.waitFor({ timeout: 5000 });
  await link.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/7-published-story.png`, fullPage: true });
  const contentHtml = await page.locator(".post-content").innerHTML();
  require("fs").writeFileSync(`${OUT}/published-content.html`, contentHtml);
  console.log("PUBLISHED CONTENT SNIPPET:\n" + contentHtml.slice(0, 400));

  await browser.close();
})();
