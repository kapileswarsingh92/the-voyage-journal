process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/crop_test";
const TEST_IMG = "/tmp/test_portrait.jpg";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();

  // Bali is owned by the demo reader account per seed.py.
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/blog/ten-days-of-doing-very-little-in-bali/edit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(200);
  const currentCoverVisible = await page.locator(".current-cover-preview").isVisible();
  console.log("Existing 'current cover' preview still shows on edit page (should be true):", currentCoverVisible);

  await page.setInputFiles("#cover_image", TEST_IMG);
  await page.waitForTimeout(250);
  const modalVisible = await page.locator(".crop-modal-overlay").isVisible();
  console.log("Crop modal opens when picking a replacement cover on the edit page (should be true):", modalVisible);
  await page.locator("[data-crop-apply]").click();
  await page.waitForTimeout(200);
  const bothPreviewsVisible =
    (await page.locator(".current-cover-preview").isVisible()) &&
    (await page.locator(".cover-preview-wrap").isVisible());
  console.log("Both the old cover and the new cropped preview show side by side (should be true):", bothPreviewsVisible);
  await page.screenshot({ path: `${OUT}/6-edit-page-both-previews.png`, fullPage: true });

  await browser.close();
})();
