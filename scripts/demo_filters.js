process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/filters";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

  await page.goto(BASE + "/blog", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/1-default.png` });

  // sort by most liked
  await page.selectOption("#sort", "liked");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  let titles = await page.locator(".post-card h3").allTextContents();
  console.log("Sorted by MOST LIKED:", titles);
  await page.screenshot({ path: `${OUT}/2-sort-liked.png` });

  // sort by title A-Z
  await page.selectOption("#sort", "title");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  titles = await page.locator(".post-card h3").allTextContents();
  console.log("Sorted by TITLE A-Z:", titles);

  // filter by a specific location
  const locSelect = page.locator('select[name="location"]');
  const options = await locSelect.locator("option").allTextContents();
  console.log("Location dropdown options:", options);
  await locSelect.selectOption({ label: "Kyoto, Japan" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);
  titles = await page.locator(".post-card h3").allTextContents();
  console.log("Filtered to Kyoto, Japan:", titles);
  console.log("URL:", page.url());
  await page.screenshot({ path: `${OUT}/3-location-filter.png` });

  // combine category + location + sort + search all together, verify state preserved
  await page.goto(BASE + "/blog?category=Culture&location=Kyoto%2C+Japan&sort=title&q=temple", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  console.log("Category select value on load:", await page.locator("select[name='location']").inputValue());
  console.log("Sort select value on load:", await page.locator("#sort").inputValue());
  console.log("Search box value on load:", await page.locator('input[type="search"][name="q"]').inputValue());
  const activeCatClass = await page.locator('.filter-list a.active').textContent();
  console.log("Active category link:", activeCatClass);
  await page.screenshot({ path: `${OUT}/4-combined-filters.png` });

  await browser.close();
})();
