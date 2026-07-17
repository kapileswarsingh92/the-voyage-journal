process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext()).newPage();

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  // test on the dashboard's pending-queue delete button this time
  await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  let dialogMessage = null;
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  const item = page.locator(".admin-item", { hasText: "Five Coffee Rituals" });
  await item.locator('button:has-text("Delete")').click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(400);

  console.log("Dialog message (dashboard):", dialogMessage);
  const flash = await page.locator(".flash").first().textContent().catch(() => null);
  console.log("Flash:", flash);
  const stillPending = await page.locator(".admin-item").count();
  console.log("Pending items remaining:", stillPending);

  await browser.close();
})();
