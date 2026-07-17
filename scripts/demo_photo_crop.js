process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/crop_test";
const TEST_IMG = "/tmp/test_portrait.jpg"; // 1200x1600 portrait, aspect 0.75

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1100 } })).newPage();

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  await page.goto(BASE + "/submit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);

  await page.fill("#title", "Testing the Photo Crop Tool");
  await page.selectOption("#category", "Travel");
  await page.fill("#author_name", "Crop Tester");

  // --- Cover photo: fixed-wide aspect crop ---
  await page.setInputFiles("#cover_image", TEST_IMG);
  await page.waitForTimeout(250);
  const modalVisible = await page.locator(".crop-modal-overlay").isVisible();
  console.log("Crop modal opens on cover photo selection:", modalVisible);
  const aspectToggleHiddenForCover = await page.locator("[data-crop-aspect-toggle]").isHidden();
  console.log("Aspect toggle hidden for cover (should be fixed-wide, true):", aspectToggleHiddenForCover);
  const titleText = await page.locator("[data-crop-title]").textContent();
  console.log("Modal title:", titleText);

  // Drag to reposition, then zoom in a bit.
  const viewportBox = await page.locator("[data-crop-viewport]").boundingBox();
  await page.mouse.move(viewportBox.x + viewportBox.width / 2, viewportBox.y + viewportBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewportBox.x + viewportBox.width / 2 - 40, viewportBox.y + viewportBox.height / 2 - 60, { steps: 5 });
  await page.mouse.up();
  await page.locator("[data-crop-zoom]").fill("40");
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${OUT}/1-cover-crop-modal.png` });

  await page.locator("[data-crop-apply]").click();
  await page.waitForTimeout(200);
  const modalGoneAfterApply = await page.locator(".crop-modal-overlay").isHidden();
  console.log("Modal closes after 'Use this crop' (should be true):", modalGoneAfterApply);
  const coverPreviewVisible = await page.locator(".cover-preview-wrap").isVisible();
  console.log("Cover preview thumbnail shown after crop (should be true):", coverPreviewVisible);
  await page.screenshot({ path: `${OUT}/2-cover-preview.png` });

  // Re-adjust the crop via the "Adjust crop" button.
  await page.locator("[data-cover-adjust]").click();
  await page.waitForTimeout(200);
  const reopenedForAdjust = await page.locator(".crop-modal-overlay").isVisible();
  console.log("Modal reopens via 'Adjust crop' (should be true):", reopenedForAdjust);
  await page.locator("[data-crop-apply]").click();
  await page.waitForTimeout(150);

  // --- Inline photo (rich editor "Insert photo"): free aspect + toggle ---
  await page.setInputFiles("[data-inline-photo-picker]", TEST_IMG);
  await page.waitForTimeout(250);
  const aspectToggleShownForInline = await page.locator("[data-crop-aspect-toggle]").isVisible();
  console.log("Aspect toggle shown for inline photo (should be true):", aspectToggleShownForInline);
  await page.locator('[data-aspect="square"]').click();
  await page.waitForTimeout(150);
  const squareActive = await page.locator('[data-aspect="square"]').evaluate((el) => el.classList.contains("is-active"));
  console.log("Square aspect option becomes active on click (should be true):", squareActive);
  await page.screenshot({ path: `${OUT}/3-inline-crop-square.png` });
  await page.locator("[data-crop-apply]").click();
  await page.waitForTimeout(200);
  const insertedPhotoCount = await page.locator(".rt-photo").count();
  console.log("Photo block inserted into the editor after crop (should be 1):", insertedPhotoCount);

  // --- Second inline photo: test "Use original, skip crop" path ---
  // Real usage resets photoPicker.value="" before each pick (see the
  // "Insert photo" button handler); mimic that so the browser fires a
  // fresh change event even though it's technically the same file again.
  await page.locator("[data-inline-photo-picker]").evaluate((el) => { el.value = ""; });
  await page.setInputFiles("[data-inline-photo-picker]", TEST_IMG);
  await page.waitForTimeout(250);
  await page.locator("[data-crop-skip]").click();
  await page.waitForTimeout(200);
  const insertedPhotoCountAfterSkip = await page.locator(".rt-photo").count();
  console.log("Photo block inserted after 'skip crop' (should be 2):", insertedPhotoCountAfterSkip);

  await page.locator("[data-rich-content]").click();
  await page.keyboard.type(
    "A short story written to test the new photo crop tool end to end, making sure both the " +
    "cover photo cropper and the inline insert-photo cropper work correctly before this story " +
    "is submitted for review."
  );

  await page.screenshot({ path: `${OUT}/4-before-submit.png`, fullPage: true });

  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  const afterSubmitUrl = page.url();
  console.log("URL after submit (should be /submit/success or similar):", afterSubmitUrl);
  await page.screenshot({ path: `${OUT}/5-after-submit.png` });

  console.log("Page errors during test (should be empty array):", JSON.stringify(consoleErrors));

  await browser.close();
})();
