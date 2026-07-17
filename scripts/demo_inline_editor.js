process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/inline_editor";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto(BASE + "/submit", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  await page.fill("#title", "Testing The Rich Photo Editor");
  await page.selectOption("#category", "Lifestyle");
  await page.fill("#author_name", "QA Editor Bot");

  const richContent = page.locator("[data-rich-content]");
  await richContent.click();
  await page.keyboard.type("This is the first paragraph of a story written entirely through the rich editor, to confirm plain typing works correctly before anything else is tested.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("This second paragraph comes right before the first inserted photo, so we can check the photo lands between two paragraphs rather than at the very top or bottom.");

  await page.screenshot({ path: `${OUT}/1-typed-text.png`, fullPage: true });

  // insert first photo — caret should land in a fresh paragraph right after it
  const [chooser1] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("[data-insert-photo]"),
  ]);
  await chooser1.setFiles("/tmp/inline1.jpg");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/2-photo-inserted.png`, fullPage: true });

  // continue typing right where the caret now is (no manual repositioning needed)
  await page.keyboard.type("This third paragraph was written after inserting the first photo, testing that the cursor correctly continues past the inline image block.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  // bold text test: type, select, bold
  await page.keyboard.type("This sentence should end up bold.");
  await page.keyboard.down("Shift");
  for (let i = 0; i < "should end up bold.".length; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.click('[data-cmd="bold"]');

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  // insert second photo
  const [chooser2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("[data-insert-photo]"),
  ]);
  await chooser2.setFiles("/tmp/inline2.jpg");
  await page.waitForTimeout(300);

  await page.keyboard.type("This is the closing paragraph after the second photo.");

  await page.screenshot({ path: `${OUT}/3-full-editor.png`, fullPage: true });

  // check the hidden fallback textarea got synced correctly
  const fallbackValue = await page.locator("[data-rich-fallback]").inputValue();
  fs.writeFileSync(`${OUT}/serialized-content.txt`, fallbackValue);
  console.log("SERIALIZED CONTENT:\n" + fallbackValue);

  // submit
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/4-success.png`, fullPage: true });

  await browser.close();
  console.log("done");
})();
