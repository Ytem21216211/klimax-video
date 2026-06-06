import { chromium } from "playwright";

const base = "http://127.0.0.1:8080";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (...args) => console.log("[CHAT-E2E]", ...args);

const errors = [];
page.on("pageerror", (err) => {
  if (!err.message.includes("WebSocket") && !err.message.includes("validateDOMNesting")) {
    errors.push(err.message);
  }
});
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("WebSocket") && !msg.text().includes("validateDOMNesting")) {
    errors.push("CONSOLE: " + msg.text());
  }
});

log("Signing in...");
await page.goto(base + "/auth");
await page.waitForSelector('input[type="email"]', { timeout: 10000 });
await page.fill('input[type="email"]', "tester@klimax.local");
await page.fill('input[type="password"]', "test12345");
await page.click('button[type="submit"]');
await page.waitForURL(/\/dashboard/, { timeout: 15000 });
await page.waitForTimeout(3000);

const chatbox = await page.$('input[placeholder*="Que veux-tu" i]');
if (!chatbox) {
  log("FAIL: chatbox not found");
  await browser.close();
  process.exit(1);
}

const testCases = [
  { prompt: "nouveau projet", expectModal: true, expectKeywords: ["J'ouvre le formulaire"] },
  { prompt: "create new video", expectModal: true, expectKeywords: ["J'ouvre le formulaire"] },
  { prompt: "fais-moi une vidéo TikTok", expectModal: true, expectKeywords: ["J'ouvre le formulaire"] },
  { prompt: "comment ajouter un b-roll", expectModal: false, expectKeywords: ["B-rolls IA"] },
  { prompt: "sfx transition", expectModal: false, expectKeywords: ["SFX"] },
  { prompt: "preset", expectModal: false, expectKeywords: ["Préréglages"] },
  { prompt: "export", expectModal: false, expectKeywords: ["Exporter"] },
  { prompt: "supprime tout", expectModal: false, expectKeywords: ["supprime rien"] },
  { prompt: "combien de projets", expectModal: false, expectKeywords: ["projet"] },
  { prompt: "aide", expectModal: false, expectKeywords: ["nouveau projet", "Banque"] },
  { prompt: "blablabla random text", expectModal: false, expectKeywords: ["assistant local"] },
];

let pass = 0, fail = 0;

for (const tc of testCases) {
  // Close any open modal first
  const openModal = await page.$('[role="dialog"]');
  if (openModal) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  await chatbox.fill(tc.prompt);
  await page.waitForTimeout(50);
  // Press Enter
  await chatbox.press("Enter");
  await page.waitForTimeout(800);

  // Check if modal is open
  const modal = await page.$('[role="dialog"][data-state="open"], [role="dialog"]:not([data-state="closed"])');
  const modalOpen = !!modal;
  const modalMatch = modalOpen === tc.expectModal;

  // Get the last AI response (find the most recent AI message bubble)
  // Strategy: read p elements that contain the AI response text
  const lastMessage = await page.evaluate(() => {
    // Find all p elements with the lead-relaxed font-bold class (used in chat bubbles)
    const bubbles = Array.from(document.querySelectorAll('p.text-\\[16px\\].leading-relaxed.font-bold'));
    if (bubbles.length === 0) return null;
    return bubbles[bubbles.length - 1]?.textContent || "";
  });

  let keywordMatch = true;
  if (tc.expectKeywords) {
    for (const kw of tc.expectKeywords) {
      if (!lastMessage || !lastMessage.toLowerCase().includes(kw.toLowerCase())) {
        keywordMatch = false;
        break;
      }
    }
  }

  const ok = modalMatch && keywordMatch;
  if (ok) {
    pass++;
    log(`PASS: "${tc.prompt}" → modal=${modalOpen}, response=${(lastMessage || "").slice(0, 60)}...`);
  } else {
    fail++;
    log(`FAIL: "${tc.prompt}" → modal=${modalOpen}(expected ${tc.expectModal}), keywords=${keywordMatch}`);
    log(`     response: ${(lastMessage || "").slice(0, 200)}`);
  }
}

log(`\n=== Results: ${pass}/${pass + fail} passed ===`);
if (errors.length) {
  log(`Errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => log("  -", e.slice(0, 200)));
}

await browser.close();
process.exit(fail > 0 ? 1 : 0);
