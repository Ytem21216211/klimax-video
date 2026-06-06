import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (...args) => console.log("[E2E]", ...args);

// Sign in as test user
log("Signing in...");
await page.goto(base + "/auth");
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.fill('input[type="email"]', "tester@klimax.local");
await page.fill('input[type="password"]', "test12345");
await page.click('button[type="submit"]');
await page.waitForURL(/\/$|\/dashboard/, { timeout: 15000 }).catch(() => {});

// Wait for dashboard to render
await page.waitForTimeout(3000);
log("URL:", page.url());

// Find the chatbox input
const chatbox = await page.$('input[placeholder*="Klimax" i], input[placeholder*="ask" i], input[placeholder*="demande" i], textarea[placeholder*="Klimax" i]');
if (!chatbox) {
  log("No chatbox found, dumping page text snippet...");
  const html = await page.content();
  log("Has chat-related strings:", html.includes("Klimax") ? "yes" : "no");
  log("Has 'Nouveau projet' string:", html.includes("Nouveau projet") ? "yes" : "no");
  log("Has 'Demander' string:", html.includes("Demander") ? "yes" : "no");
  // Try to find an input near the bottom of the page
  const allInputs = await page.$$('input,textarea');
  log("Total inputs/textareas found:", allInputs.length);
  for (const inp of allInputs.slice(0, 10)) {
    const ph = await inp.getAttribute("placeholder");
    const type = await inp.getAttribute("type");
    log("  -", type || "input", "ph:", ph);
  }
} else {
  log("Found chatbox, testing 'nouveau projet'...");
  await chatbox.fill("nouveau projet");
  await page.waitForTimeout(100);
  // Find and click send button
  const sendBtn = await page.$('button[aria-label*="send" i], button:has(svg.lucide-send), button:has([data-icon="send"])');
  if (sendBtn) {
    await sendBtn.click();
  } else {
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(2000);
  // Check if a modal opened
  const modalOpen = await page.$('[role="dialog"]:not([aria-hidden="true"])');
  log("Modal opened after 'nouveau projet':", !!modalOpen);
  // Check for AI response in chat
  const messages = await page.$$eval('[class*="message"], [class*="chat"]', (els) => els.map((e) => e.textContent?.slice(0, 200)).filter(Boolean));
  log("Chat messages found:", messages.length);
  messages.slice(-3).forEach((m, i) => log(`  msg ${i}:`, m));
}

// Test: presets tab
log("\nTesting SFX tab in asset bank...");
await page.goto(base + "/asset-bank?tab=sfx");
await page.waitForTimeout(2000);
const sfxCards = await page.$$eval('button, [class*="card"]', (els) => els.filter((e) => e.textContent?.includes("Film roll") || e.textContent?.includes("Whoosh") || e.textContent?.includes("Flash") || e.textContent?.includes("Pop") || e.textContent?.includes("Ding") || e.textContent?.includes("Boom")).length);
log("SFX cards visible in bank:", sfxCards);

await browser.close();
log("DONE");
