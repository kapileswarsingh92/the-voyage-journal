process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext()).newPage();

  let dialogFired = false;
  let dialogMessage = null;

  await page.goto(BASE + "/account/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="email"]', "admin@voyagejournal.com");
  await page.fill('input[name="password"]', "AdminDemo123");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("domcontentloaded");

  await page.goto(BASE + "/admin/posts?status=approved", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);

  page.once("dialog", async (dialog) => {
    dialogFired = true;
    dialogMessage = dialog.message();
    await dialog.dismiss(); // CANCEL this time — post should survive
  });

  const row = page.locator('tr:has-text("Patagonia")').first();
  await row.locator('button:has-text("Delete")').click();
  await page.waitForTimeout(500);

  console.log("Dialog fired:", dialogFired);
  console.log("Dialog message:", dialogMessage);
  console.log("URL after dismiss (should be unchanged, no navigation):", page.url());

  const stillThere = await page.locator('tr:has-text("Patagonia")').count();
  console.log("Patagonia row still present after CANCEL:", stillThere > 0);

  await browser.close();
})();
