import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (...args) => console.log("[E2E]", ...args);

page.on("pageerror", (err) => log("PAGEERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") log("CONSOLE.error:", msg.text());
});

log("Signing in...");
await page.goto(base + "/auth");
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.fill('input[type="email"]', "tester@klimax.local");
await page.fill('input[type="password"]', "test12345");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
log("URL after signin:", page.url());

await page.waitForTimeout(4000);
log("URL after wait:", page.url());

// Get the body text first
const bodyText = await page.evaluate(() => document.body.innerText);
log("Body text length:", bodyText.length);
log("Body text first 500 chars:", bodyText.slice(0, 500));
log("Body text last 500 chars:", bodyText.slice(-500));

// List all interactive elements
const interactives = await page.$$eval(
  "button, input, textarea, a, [role=button]",
  (els) =>
    els.map((e) => ({
      tag: e.tagName,
      type: e.getAttribute("type"),
      text: (e.textContent || "").trim().slice(0, 50),
      placeholder: e.getAttribute("placeholder"),
      ariaLabel: e.getAttribute("aria-label"),
    })),
);
log("Total interactives:", interactives.length);
interactives.slice(0, 30).forEach((i, idx) => log(`  ${idx}:`, JSON.stringify(i)));

await browser.close();
log("DONE");
