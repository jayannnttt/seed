/* Functional UI tests: simulation run, alert acknowledge, inventory validation */
import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

/* ---------------------------------------------------- 1. SIMULATION ------ */
console.log("STEP 1: run a flood simulation");
await page.goto(`${BASE}/simulation`, { waitUntil: "networkidle", timeout: 45000 });
await page.getByRole("button", { name: /start simulation/i }).first().click();
await page.waitForTimeout(3500);
const sim = await page.textContent("body");
console.log("   affected lots table:", /Affected|lot/i.test(sim ?? ""));
console.log("   risk score shown:", /\b\d{1,3}\/100\b/.test(sim ?? "") || /risk score/i.test(sim ?? ""));
console.log("   checklist rendered:", /checklist/i.test(sim ?? ""));
console.log("   simulated badge visible:", /simulat/i.test(sim ?? ""));
console.log("   reserve stock section:", /reserve stock|No reserve stock/i.test(sim ?? ""));

/* ---------------------------------------------------- 2. ALERTS ---------- */
console.log("\nSTEP 2: acknowledge an open alert");
await page.goto(`${BASE}/alerts`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(800);
const ackBtn = page.getByRole("button", { name: /^acknowledge/i }).first();
if (await ackBtn.count()) {
  await ackBtn.click();
  await page.waitForTimeout(700);
  const noteBox = page.locator("[role=dialog] textarea, [role=dialog] input[type=text]").first();
  if (await noteBox.count()) await noteBox.fill("UI test: inspector notified");
  await page.getByRole("button", { name: /acknowledge/i }).last().click();
  await page.waitForTimeout(1600);
  const after = await page.textContent("body");
  console.log("   acknowledged state visible:", /acknowledged/i.test(after ?? ""));
} else {
  console.log("   no open alert to acknowledge");
}

/* ---------------------------------------------------- 3. INVENTORY ------- */
console.log("\nSTEP 3: inventory validation (viability date without rate)");
await page.goto(`${BASE}/inventory`, { waitUntil: "networkidle", timeout: 45000 });
await page.waitForTimeout(900);
await page.getByRole("button", { name: /add seed lot/i }).first().click();
await page.waitForTimeout(800);
const selects = page.locator("[role=dialog] select");
if (await selects.count() >= 2) {
  await selects.nth(0).selectOption({ index: 1 });
  await selects.nth(1).selectOption({ index: 1 });
}
const codeInput = page.locator("[role=dialog] input").first();
await codeInput.fill("LOT-UITEST-001");
const numberInputs = page.locator("[role=dialog] input[type=number]");
if (await numberInputs.count()) await numberInputs.first().fill("12");
const dateInputs = page.locator("[role=dialog] input[type=date]");
if (await dateInputs.count() >= 2) await dateInputs.nth(1).fill("2026-01-15");
await page.waitForTimeout(300);
await page.getByRole("button", { name: /^(save|create|add lot|add seed lot)/i }).last().click();
await page.waitForTimeout(1200);
const validation = await page.textContent("body");
console.log("   blocked as expected:",
  /measured rate|clear the test date|must not look/i.test(validation ?? ""));

console.log("\nCONSOLE/PAGE ERRORS:", errors.length);
errors.slice(0, 6).forEach((e) => console.log("  !", e.slice(0, 200)));
await browser.close();
