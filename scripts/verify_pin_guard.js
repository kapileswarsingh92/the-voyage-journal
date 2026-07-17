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

  // Grab a valid CSRF token from any admin page, then attempt to pin a
  // still-pending post (id 10) directly via fetch, bypassing the UI (which
  // never shows a Pin button for non-approved posts). The server route
  // should refuse it since it isn't 'approved'.
  await page.goto(BASE + "/admin/posts?status=pending", { waitUntil: "domcontentloaded" });
  const csrf = await page.locator('input[name="csrf_token"]').first().getAttribute("value");

  const result = await page.evaluate(async ({ csrf }) => {
    const body = new URLSearchParams();
    body.set("csrf_token", csrf);
    const res = await fetch("/admin/posts/10/pin", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      redirect: "follow",
    });
    const text = await res.text();
    return { status: res.status, url: res.url, hasErrorFlash: text.includes("Only live stories can be pinned") };
  }, { csrf });
  console.log("Attempted server-side pin of a pending post -> response:", JSON.stringify(result));

  await browser.close();
})();
