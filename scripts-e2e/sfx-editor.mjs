import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (...args) => console.log("[SFX-E2E]", ...args);

log("Signing in...");
await page.goto(base + "/auth");
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.fill('input[type="email"]', "tester@klimax.local");
await page.fill('input[type="password"]', "test12345");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 15000 });
await page.waitForTimeout(2500);

// Get token
const tokenInfo = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter(k => k.includes("auth") || k.includes("token") || k.includes("supabase"));
  const result = {};
  for (const k of keys) {
    const v = localStorage.getItem(k);
    result[k] = v ? v.slice(0, 80) : null;
  }
  return result;
});
log("Auth-related localStorage keys:", JSON.stringify(tokenInfo, null, 2));

// Just navigate to a project via dashboard click instead
const projects = await page.$$eval('button', (els) => els
  .filter(e => e.textContent?.match(/SFX Test|E2E Auto-Broll|Klimax/))
  .map(e => e.textContent?.trim().slice(0, 30))
);
log("Project buttons in sidebar:", projects);

// Click the SFX Test project (or first available)
const targetBtn = await page.$('button:has-text("SFX Test")') || await page.$('button:has-text("E2E Auto-Broll")') || await page.$('button:has-text("Klimax")');
if (!targetBtn) { log("FAIL: no project button found"); await browser.close(); process.exit(1); }
const targetText = await targetBtn.textContent();
log("Clicking project:", targetText?.trim().slice(0, 40));
await targetBtn.click();
await page.waitForTimeout(4000);
log("URL after click:", page.url());

// Check if SfxPanel is rendered
const sfxPanelTitle = await page.$('h3:has-text("SFX")');
if (!sfxPanelTitle) {
  const allH3 = await page.$$eval('h3', (els) => els.map(e => e.textContent?.trim()));
  log("H3 elements found:", allH3);
  log("FAIL: SFX panel not visible");
  await browser.close();
  process.exit(1);
}
log("✓ SFX panel visible in editor");

// Check transition buttons
const transitionButtons = await page.$$eval('button', (els) => els
  .filter(e => e.textContent?.includes("Film roll") || e.textContent?.includes("Whoosh") || e.textContent?.includes("Flash") || e.textContent?.includes("Aucune"))
  .map(e => e.textContent?.trim().slice(0, 30))
);
log("Transition buttons found:", transitionButtons.length, "→", transitionButtons);

// Find Film roll button and click it
const filmRoll = await page.$('button:has-text("Film roll")');
if (!filmRoll) { log("FAIL: Film roll button not found"); await browser.close(); process.exit(1); }
await filmRoll.click();
log("Clicked Film roll transition");
await page.waitForTimeout(2500);

// Verify on the API side
const savedSettings = await page.evaluate(async (projectId) => {
  // Get the current access_token from localStorage
  const keys = Object.keys(localStorage).filter(k => k.includes("auth-token"));
  const authData = keys.length > 0 ? JSON.parse(localStorage.getItem(keys[0])) : null;
  const token = authData?.access_token;
  if (!token) return { error: "no token" };
  const r = await fetch(`http://127.0.0.1:8787/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text();
    return { error: `fetch failed: ${r.status}`, body: t.slice(0, 200) };
  }
  const data = await r.json();
  return data.project?.settings;
}, page.url().split("/project/")[1]);
log("Saved settings after click:", JSON.stringify(savedSettings));

if (savedSettings?.sfxTransition !== "transition_film_roll") {
  log("FAIL: expected transition_film_roll, got", savedSettings?.sfxTransition);
  await browser.close();
  process.exit(1);
}
log("✓ transition_film_roll saved to project");

log("\n=== SFX E2E: PASSED ===");
await browser.close();
process.exit(0);
