process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/round3";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(300);

  await page.goto(BASE + "/admin/posts?status=pending", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const row = page.locator('tr:has-text("Round3 Verify 1784196310")').first();
  await row.waitFor({ timeout: 5000 });
  await row.locator('button:has-text("Approve")').click();
  await page.waitForTimeout(400);

  await page.goto(BASE + "/blog/round3-verify-1784196310", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const bodyHtml = await page.locator(".post-content").innerHTML();
  console.log("Rendered span with Lora font-family:", /Lora/.test(bodyHtml));
  console.log("Rendered span with 18px font-size:", /18px/.test(bodyHtml));
  console.log("Bold text rendered:", /<b>|<strong>/i.test(bodyHtml));
  console.log("Inline photo rendered as real <img>, not a literal token:", /<figure class="inline-photo">/.test(bodyHtml) && !/\[\[photo/.test(bodyHtml));
  console.log("No leaked <script> tag in rendered page:", !/<script>[^<]*__xssFired/.test(bodyHtml));
  await page.screenshot({ path: OUT + "/2-published-story.png", fullPage: true });

  await browser.close();
})().catch((e) => {
  console.error("PUBLISH TEST ERROR:", e);
  process.exit(1);
});
