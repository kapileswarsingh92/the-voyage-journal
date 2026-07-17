process.env.NODE_PATH = "/home/claude/.npm-global/lib/node_modules";
require("module").Module._initPaths();
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:5050";
const OUT = "/tmp/submit_flow";

const STORY = {
  title: "A Foggy Morning Walk Across Charles Bridge",
  location: "Prague, Czech Republic",
  author_name: "Nora Vesely",
  author_email: "nora.v@example.com",
  excerpt: "",
  content: `Prague at 6am belongs almost entirely to the statues. I crossed Charles Bridge before the first tour group arrived, fog still sitting low over the Vltava, every saint's statue along the balustrade looking slightly more mysterious than they will by 10am.

**The Old Town Square was completely empty**, which I'm told happens for about twenty minutes a day, right around dawn. I had a coffee at a stall that wasn't technically open yet — the owner just waved me over anyway.

- Go before 7am, genuinely, it's a different city
- The astronomical clock is more interesting up close than in photos
- Bring a coat even in summer, the river fog has its own temperature`,
};

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();

  // Step 1: land on the homepage, click "Submit a Story" in the nav
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/1-homepage-nav.png`, clip: { x: 0, y: 0, width: 1280, height: 80 } });

  await page.click("text=Submit a Story");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/2-empty-form.png`, fullPage: true });

  // Step 2: fill in the form
  await page.fill("#title", STORY.title);
  await page.selectOption("#category", "Travel");
  await page.fill("#location", STORY.location);
  await page.fill("#author_name", STORY.author_name);
  await page.fill("#author_email", STORY.author_email);
  await page.setInputFiles("#cover_image", "/tmp/demo-prague.jpg");
  await page.fill("#content", STORY.content);
  await page.screenshot({ path: `${OUT}/3-filled-form.png`, fullPage: true });

  // Step 3: submit
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/4-success.png`, fullPage: true });

  // Step 4: log in as admin and show it sitting in the review queue
  await page.goto(BASE + "/account/login", { waitUntil: "networkidle" });
  await page.fill("#email", "admin@voyagejournal.com");
  await page.fill("#password", "AdminDemo123");
  await page.click("button[type=submit]");
  await page.waitForLoadState("networkidle");
  await page.goto(BASE + "/admin/", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/5-admin-queue.png`, fullPage: true });

  // Step 5: approve it
  const approveBtn = page.locator(`text=${STORY.title}`).locator("xpath=ancestor::div[contains(@class,'admin-item')]").locator("button:has-text('Approve')");
  await approveBtn.click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/6-after-approve.png`, fullPage: true });

  // Step 6: it's now live publicly
  await page.goto(BASE + "/blog", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/7-live-on-blog.png`, fullPage: true });

  await browser.close();
  console.log("done");
})();
