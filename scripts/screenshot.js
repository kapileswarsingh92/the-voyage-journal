process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/shots";

const pages = [
  { path: "/", file: "01-home.png", full: true },
  { path: "/blog", file: "02-listing.png", full: true },
  { path: "/blog/chasing-blue-domes-three-days-in-santorini", file: "03-detail.png", full: true },
  { path: "/submit", file: "04-submit.png", full: true },
  { path: "/account/login", file: "05-login.png", full: false },
  { path: "/account/signup", file: "06-signup.png", full: false },
  { path: "/about", file: "07-about.png", full: true },
];

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  for (const p of pages) {
    await page.goto(BASE + p.path, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${p.file}`, fullPage: p.full });
    console.log("captured", p.path);
  }

  // mobile viewport for home page
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/08-home-mobile.png`, fullPage: true });
  console.log("captured mobile home");

  await browser.close();
})();
