process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/my_stories";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  // visit the Bali story once as an outside visitor first (log out, view, log back in)
  // -- skip that for now, just go straight to My Stories
  await page.goto(BASE + "/account/my-stories", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/1-my-stories.png`, fullPage: true });
  console.log("my stories page loaded");

  // click "Edit story" on the live (Bali) story — it's the second card
  // (pending posts sort first since they were created "now" in seed.py)
  const editLinks = await page.locator('a:has-text("Edit story")').all();
  console.log("edit links found:", editLinks.length);
  await editLinks[1].click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/2-edit-page.png`, fullPage: true });

  const richHtml = await page.locator("[data-rich-content]").innerHTML();
  fs.writeFileSync(`${OUT}/edit-rich-html.html`, richHtml);
  console.log("EDIT PAGE RICH CONTENT:\n" + richHtml.slice(0, 600));

  await browser.close();
})();
