process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext()).newPage();
  page.on("dialog", (d) => d.accept());

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  // reject a still-approved post first so we have a "declined" one to delete
  await page.goto(BASE + "/admin/posts?status=approved", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const row = page.locator('tr:has-text("Marrakech")').first();
  await row.locator('button:has-text("Unpublish")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const item = page.locator(".admin-item", { hasText: "Marrakech" });
  await item.locator("summary").click();
  await item.locator('textarea[name="note"]').fill("Test rejection note for delete coverage.");
  await item.locator('button:has-text("Confirm decline")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  await page.goto(BASE + "/admin/posts?status=rejected", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const rejectedRow = page.locator('tr:has-text("Marrakech")').first();
  const beforeCount = await page.locator("tbody tr").count();
  console.log("Rejected rows before delete:", beforeCount);
  await rejectedRow.locator('button:has-text("Delete")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  const flash = await page.locator(".flash").first().textContent().catch(() => null);
  console.log("Flash:", flash);
  const afterCount = await page.locator("tbody tr").count();
  console.log("Rejected rows after delete:", afterCount);

  await browser.close();
})();
