process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/inline_editor";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto(BASE + "/submit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  // deliberately leave title blank/too short to trigger a validation error
  await page.fill("#title", "Hi");
  await page.selectOption("#category", "Travel");
  await page.fill("#author_name", "QA Editor Bot");

  const richContent = page.locator("[data-rich-content]");
  await richContent.click();
  await page.keyboard.type("A paragraph before the photo, long enough to pass the content length check on its own so we can isolate the title validation error specifically.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("[data-insert-photo]"),
  ]);
  await chooser.setFiles("/tmp/inline1.jpg");
  await page.waitForTimeout(300);
  await page.keyboard.type("A paragraph after the photo.");

  await page.screenshot({ path: `${OUT}/8-before-bad-submit.png`, fullPage: true });

  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);

  await page.screenshot({ path: `${OUT}/9-after-error-reload.png`, fullPage: true });

  const flash = await page.locator(".flash, .alert, [class*='flash']").first().textContent().catch(() => null);
  console.log("FLASH MESSAGE:", flash);

  const chipText = await page.locator(".rt-photo-chip").first().textContent().catch(() => null);
  console.log("CHIP TEXT:", chipText);

  const richHtml = await page.locator("[data-rich-content]").innerHTML();
  require("fs").writeFileSync(`${OUT}/reimported-editor.html`, richHtml);
  console.log("RE-IMPORTED EDITOR HTML:\n" + richHtml);

  await browser.close();
})();
