process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");
const { PNG } = (() => { try { return require("pngjs"); } catch (e) { return {}; } })();

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/round3";
const LARGE_IMG = "/tmp/test_large.jpg"; // 4000x2500
const PORTRAIT_IMG = "/tmp/test_portrait.jpg"; // 1200x1600

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 1200 } })).newPage();

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  await page.goto(BASE + "/submit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);

  await page.fill("#title", "Round3 Verify 1784196310");
  await page.selectOption("#category", "Travel");
  await page.fill("#author_name", "Round3 Tester");
  await page.fill("#location", "Test City");

  // --- Large cover photo (>8MB old cap not needed, just verify big pixel dims work) ---
  await page.setInputFiles("#cover_image", LARGE_IMG);
  await page.waitForTimeout(300);
  console.log("Cover crop modal visible:", await page.locator(".crop-modal-overlay").isVisible());
  await page.click("[data-crop-skip]"); // skip crop, use original -> server resizes to COVER_MAX_SIZE (3000x1875)
  await page.waitForTimeout(200);

  // --- Type story content with Bold + a font family/size change ---
  const rich = page.locator("[data-rich-content]");
  await rich.click();
  await page.keyboard.type("This is the opening paragraph of a much longer story used to test font controls, freeform cropping, sanitization and the new preview step end to end. ");

  // Select some of the typed text and apply bold
  await page.keyboard.down("Shift");
  for (let i = 0; i < 20; i++) await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.up("Shift");
  await page.click('[data-cmd="bold"]');

  // Move cursor to end, add a new paragraph, then select-all and set a font+size (whole-content path)
  await page.keyboard.press("End");
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nA second paragraph with plenty more detail so the story easily clears the hundred character minimum length requirement for submission.");

  // Deselect (collapsed selection) then choose a font family+size -> should apply to WHOLE content
  await page.keyboard.press("Control+Home");
  await page.selectOption("[data-font-family]", "'Lora', Georgia, serif");
  await page.selectOption("[data-font-size]", "18px");
  await page.waitForTimeout(100);

  const richHtmlAfterBaseFont = await rich.innerHTML();
  console.log("Base font span present:", /data-base-font/.test(richHtmlAfterBaseFont));
  console.log("font-family Lora applied:", /Lora/.test(richHtmlAfterBaseFont));
  console.log("font-size 18px applied:", /18px/.test(richHtmlAfterBaseFont));
  console.log("Bold tag preserved:", /<b>|<strong>/i.test(richHtmlAfterBaseFont));

  // --- Insert an inline photo, choose Freeform crop mode, drag+resize the rect ---
  await page.click("[data-insert-photo]");
  await page.setInputFiles("[data-inline-photo-picker]", PORTRAIT_IMG);
  await page.waitForTimeout(300);
  await page.click('[data-aspect="freeform"]');
  await page.waitForTimeout(200);
  const stageVisible = await page.locator("[data-crop-stage]").isVisible();
  const viewportHiddenNow = await page.locator("[data-crop-viewport]").isHidden();
  console.log("Freeform stage visible:", stageVisible, "| pan/zoom viewport hidden:", viewportHiddenNow);

  const rectBoxBefore = await page.locator("[data-crop-rect]").boundingBox();
  // Drag the rectangle body to move it
  await page.mouse.move(rectBoxBefore.x + rectBoxBefore.width / 2, rectBoxBefore.y + rectBoxBefore.height / 2);
  await page.mouse.down();
  await page.mouse.move(rectBoxBefore.x + rectBoxBefore.width / 2 - 20, rectBoxBefore.y + rectBoxBefore.height / 2 - 10, { steps: 5 });
  await page.mouse.up();
  const rectBoxAfterMove = await page.locator("[data-crop-rect]").boundingBox();
  console.log("Rect moved:", rectBoxAfterMove.x !== rectBoxBefore.x || rectBoxAfterMove.y !== rectBoxBefore.y);

  // Drag SE handle to resize
  const seHandle = await page.locator('[data-handle="se"]').boundingBox();
  await page.mouse.move(seHandle.x + seHandle.width / 2, seHandle.y + seHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(seHandle.x - 60, seHandle.y - 40, { steps: 5 });
  await page.mouse.up();
  const rectBoxAfterResize = await page.locator("[data-crop-rect]").boundingBox();
  console.log("Rect resized smaller:", rectBoxAfterResize.width < rectBoxAfterMove.width && rectBoxAfterResize.height < rectBoxAfterMove.height);

  await page.click("[data-crop-apply]");
  await page.waitForTimeout(300);
  console.log("Photo block inserted:", await page.locator(".rt-photo").count());

  // --- Preview step ---
  await page.click("[data-preview-story]");
  await page.waitForTimeout(200);
  const previewVisible = await page.locator(".preview-modal-overlay").isVisible();
  const previewHasImg = await page.locator("[data-preview-body] img").count();
  const previewTitle = await page.locator("[data-preview-title]").textContent();
  const previewCoverVisible = await page.locator("[data-preview-cover]").isVisible();
  console.log("Preview modal visible:", previewVisible, "| title:", previewTitle, "| inline photo shown in preview:", previewHasImg > 0, "| cover shown in preview:", previewCoverVisible);
  await page.screenshot({ path: OUT + "/1-preview.png", fullPage: false });
  await page.click("[data-preview-close]");
  await page.waitForTimeout(150);

  // --- Try an XSS payload pasted directly into the fallback textarea's underlying HTML via JS eval on richContent (simulating a malicious client bypassing our own JS) ---
  await page.evaluate(() => {
    const rc = document.querySelector("[data-rich-content]");
    rc.innerHTML += '<img src=x onerror="window.__xssFired=true"><script>window.__xssFired2=true<\/script><a href="javascript:window.__xssFired3=true">click</a>';
  });
  await page.waitForTimeout(100);

  await page.click('button[type="submit"]');
  await page.waitForTimeout(500);

  const url = page.url();
  console.log("After submit URL:", url);
  const flash = await page.locator(".flash, [class*='flash']").allTextContents().catch(() => []);
  console.log("Flash messages:", flash);

  await browser.close();
})().catch((e) => {
  console.error("TEST SCRIPT ERROR:", e);
  process.exit(1);
});
