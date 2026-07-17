process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  const page = await context.newPage();

  // Log in as the reader account, then submit a fresh story as that user so
  // we have something in "My Stories" to edit.
  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "reader@voyagejournal.com");
  await page.fill('input[name="password"]', "ReaderDemo123");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(300);

  await page.goto(BASE + "/submit", { waitUntil: "domcontentloaded" });
  await page.fill("#title", "Edit Flow Round 3 Story");
  await page.selectOption("#category", "Culture");
  await page.fill("#author_name", "Edit Tester");
  const rich = page.locator("[data-rich-content]");
  await rich.click();
  await page.keyboard.type("Original paragraph text long enough to pass the hundred character minimum length validation on the server for this story.");
  await page.selectOption("[data-font-family]", "'Caveat', cursive");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(400);
  console.log("Submitted, now at:", page.url());

  await page.goto(BASE + "/account/my-stories", { waitUntil: "domcontentloaded" });
  const editLink = page.locator('a:has-text("Edit")').first();
  await editLink.click();
  await page.waitForTimeout(300);
  console.log("On edit page:", page.url());

  const importedHtml = await page.evaluate(() => document.querySelector("[data-rich-content]").innerHTML);
  console.log("Imported content shows Caveat font:", /Caveat/.test(importedHtml));

  // Make an edit: append more text, change font size for whole story, save.
  await page.locator("[data-rich-content]").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Added a follow-up sentence during editing to confirm the edit flow still works end to end.");
  await page.selectOption("[data-font-size]", "22px");
  await page.waitForTimeout(100);

  // Preview before saving.
  await page.click("[data-preview-story]");
  await page.waitForTimeout(200);
  console.log("Preview visible on edit page:", await page.locator(".preview-modal-overlay").isVisible());
  await page.click("[data-preview-close]");

  await page.click('button[type="submit"]');
  await page.waitForTimeout(400);
  console.log("After save, at:", page.url());

  await browser.close();
})().catch((e) => {
  console.error("EDIT TEST ERROR:", e);
  process.exit(1);
});
