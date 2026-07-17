process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const POST = "/blog/chasing-blue-domes-three-days-in-santorini";
const OUT = "/tmp/share_flow";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await context.newPage();

  // Step 1: logged-out visitor viewing a story, scrolled to the action row
  await page.goto(BASE + POST, { waitUntil: "networkidle" });
  await page.locator("#engage").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/1-logged-out-actions.png` });

  // Step 2: hover/click the Share action while logged out -> goes to login
  await page.click("#engage .share-wrap .action-btn");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/2-share-prompts-login.png` });

  // Step 3: log in as the demo reader
  await page.fill("#email", "reader@voyagejournal.com");
  await page.fill("#password", "ReaderDemo123");
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");

  // Step 4: back on the story, now logged in
  await page.goto(BASE + POST, { waitUntil: "networkidle" });
  await page.locator("#engage").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/3-logged-in-actions.png` });

  // Step 5: click Share -> menu opens with social links + copy link
  await page.click("[data-share-toggle]");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/4-share-menu-open.png` });

  // Step 6: click "Copy link" -> confirmation text swap
  await page.click("[data-copy-link]");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/5-link-copied.png` });

  await browser.close();
  console.log("done");
})();
