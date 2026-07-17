process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  // 1. Log in as reader, try to edit a story reader does NOT own -> expect 403
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  const res1 = await page.goto(BASE + "/blog/chasing-blue-domes-three-days-in-santorini/edit", { waitUntil: "domcontentloaded" });
  console.log("Editing someone else's story -> status:", res1.status());

  // 2. Edit page with a validation error (title too short) -> should not crash, should show chip fallback path
  await page.goto(BASE + "/blog/ten-days-of-doing-very-little-in-bali/edit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill("#title", "Hi");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  const flash = await page.locator(".flash").first().textContent().catch(() => null);
  console.log("Validation error flash:", flash);
  const richHtmlAfterError = await page.locator("[data-rich-content]").innerHTML();
  console.log("Contains rt-photo-chip placeholder:", richHtmlAfterError.indexOf("rt-photo-chip") !== -1);
  console.log("Contains literal [[photo: leak:", richHtmlAfterError.indexOf("[[photo:") !== -1);

  await browser.close();
})();
