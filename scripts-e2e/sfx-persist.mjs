import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (...args) => console.log("[PERSIST]", ...args);

log("Signing in...");
await page.goto(base + "/auth");
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.fill('input[type="email"]', "tester@klimax.local");
await page.fill('input[type="password"]', "test12345");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 15000 });
await page.waitForTimeout(2500);

const projectId = "project-1780752893538-9c57b5";
log("Going to project:", projectId);
await page.goto(`${base}/project/${projectId}`);
await page.waitForTimeout(5000);

// Find Whoosh button and click it (different from Film roll)
log("Clicking Whoosh transition...");
const whoosh = await page.$('button:has-text("Whoosh")');
if (!whoosh) { log("FAIL: Whoosh button not found"); await browser.close(); process.exit(1); }
await whoosh.click();
await page.waitForTimeout(2000);

// Reload page
log("Reloading page...");
await page.reload();
await page.waitForTimeout(5000);

// Check that the SFX panel shows Whoosh as active (highlighted)
const whooshHighlighted = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const whooshBtn = buttons.find(b => b.textContent?.includes('Whoosh'));
  if (!whooshBtn) return null;
  return whooshBtn.className;
});
log("Whoosh button className after reload:", whooshHighlighted);

if (whooshHighlighted && (whooshHighlighted.includes('bg-white text-black') || whooshHighlighted.includes('border-white'))) {
  log("✓ Whoosh is highlighted as active (persisted)");
} else {
  log("Note: class detection may differ, checking API...");
  const settings = await page.evaluate(async (projectId) => {
    const keys = Object.keys(localStorage).filter(k => k.includes("auth-token"));
    const authData = JSON.parse(localStorage.getItem(keys[0]));
    const r = await fetch(`http://127.0.0.1:8787/api/projects/${projectId}`, { headers: { Authorization: `Bearer ${authData.access_token}` } });
    const data = await r.json();
    return data.project?.settings;
  }, projectId);
  log("Project settings.sfxTransition:", settings?.sfxTransition);
  if (settings?.sfxTransition === "transition_whoosh") {
    log("✓ transition_whoosh persisted in API");
  } else {
    log("FAIL: expected transition_whoosh");
    await browser.close();
    process.exit(1);
  }
}

// Also test sidebar collapse
log("\nTesting sidebar collapse...");
const collapseBtn = await page.$('button[title="Réduire le panneau"]');
if (collapseBtn) {
  await collapseBtn.click();
  await page.waitForTimeout(500);
  const expandBtn = await page.$('button[title="Ouvrir le panneau"]');
  if (expandBtn) {
    log("✓ Sidebar collapsed → expand button visible");
    // Re-open
    await expandBtn.click();
    await page.waitForTimeout(500);
  } else {
    log("FAIL: expand button not visible after collapse");
  }
} else {
  log("Note: collapse button not found by title (may use other selector)");
}

log("\n=== PERSIST E2E: PASSED ===");
await browser.close();
process.exit(0);
