import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (...args) => console.log("[SFX-DEBUG]", ...args);

page.on("pageerror", (err) => log("PAGEERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("WebSocket") && !msg.text().includes("validateDOMNesting")) {
    log("CONSOLE.error:", msg.text().slice(0, 300));
  }
});

log("Signing in...");
await page.goto(base + "/auth");
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.fill('input[type="email"]', "tester@klimax.local");
await page.fill('input[type="password"]', "test12345");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 15000 });
await page.waitForTimeout(2500);

// Go directly to a known project
const projectId = "project-1780752893538-9c57b5";
log("Going to project:", projectId);
await page.goto(`${base}/project/${projectId}`);
await page.waitForTimeout(5000);

log("URL:", page.url());
const bodyText = await page.evaluate(() => document.body.innerText);
log("Body length:", bodyText.length);
log("First 500 chars:", bodyText.slice(0, 500));
log("Last 500 chars:", bodyText.slice(-500));

// List all interactive elements
const interactives = await page.$$eval(
  "button, input, textarea, h1, h2, h3",
  (els) => els.map(e => ({ tag: e.tagName, text: (e.textContent || "").trim().slice(0, 50) })),
);
log("Interactives/headers count:", interactives.length);
interactives.slice(0, 30).forEach((i, idx) => log(`  ${idx}: ${i.tag} "${i.text}"`));

await browser.close();
