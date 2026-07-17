process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext()).newPage();

  // Submitting with no cover photo and no inline photos at all should be
  // completely unaffected by the new crop tool (it should never even try
  // to open, since no file was ever picked).
  await page.goto(BASE + "/submit", { waitUntil: "domcontentloaded" });
  await page.fill("#title", "A Story With No Photos At All");
  await page.selectOption("#category", "Culture");
  await page.fill("#author_name", "No Photo Tester");
  await page.locator("[data-rich-content]").click();
  await page.keyboard.type(
    "This story deliberately has no cover photo and no inline photos, to make sure the new " +
    "crop tool doesn't get in the way of a perfectly normal text-only submission."
  );
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");
  const heading = await page.locator("h1").first().textContent();
  console.log("Submission with zero photos still succeeds, heading:", heading.trim());
  const modalExists = await page.locator(".crop-modal-overlay").count();
  console.log("Crop modal never got created (should be 0, since no file was ever picked):", modalExists);

  await browser.close();
})();
