process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/my_stories";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/blog/ten-days-of-doing-very-little-in-bali/edit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  // remove the FIRST existing inline photo
  const firstPhotoRemove = page.locator(".rt-photo-existing .rt-photo-remove").first();
  await firstPhotoRemove.click();
  await page.waitForTimeout(200);

  // click at the very end of the editor and add a new sentence + a brand new photo
  await page.locator("[data-rich-content]").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Edited: adding a fresh closing thought and a brand new photo.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("[data-insert-photo]"),
  ]);
  await chooser.setFiles("/tmp/inline1.jpg");
  await page.waitForTimeout(300);

  await page.screenshot({ path: `${OUT}/3-edit-modified.png`, fullPage: true });

  const fallbackValue = await page.locator("[data-rich-fallback]").inputValue();
  console.log("SERIALIZED EDIT CONTENT:\n" + fallbackValue);

  const photoPlan = await page.locator('[data-photo-plan-input]').getAttribute("value");
  console.log("PHOTO PLAN (pre-submit, may be empty until submit):", photoPlan);

  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/4-after-save.png`, fullPage: true });
  console.log("URL after save:", page.url());

  // confirm it now shows as pending in My Stories
  await page.goto(BASE + "/account/my-stories", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/5-my-stories-after-edit.png`, fullPage: true });

  // confirm the live page is gone (unpublished) - should 404
  const res = await page.goto(BASE + "/blog/ten-days-of-doing-very-little-in-bali", { waitUntil: "domcontentloaded" });
  console.log("live page status after unpublish:", res.status());

  await browser.close();
})();
