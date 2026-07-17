process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto("http://127.0.0.1:5050/account/signup", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(150);
  await page.screenshot({ path: "/tmp/signup-page.png", fullPage: true });
  await browser.close();
})();
