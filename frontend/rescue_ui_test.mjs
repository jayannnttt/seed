/* Functional UI test: run the signature Seed Rescue workflow end-to-end
 * through the browser: create request -> find donor -> propose -> approve
 * -> dispatch -> receive.
 */
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

const step = (n, msg) => console.log(`STEP ${n}: ${msg}`);
try {
  step(1, "open /rescue");
  await page.goto(`${BASE}/rescue`, { waitUntil: "networkidle", timeout: 45000 });

  step(2, "click 'New rescue request'");
  await page.getByRole("button", { name: /new rescue request/i }).first().click();
  await page.waitForTimeout(700);

  step(3, "fill the create form");
  const selects = page.locator("select");
  const nSelects = await selects.count();
  console.log("   selects in dialog:", nSelects);

  // variety select = first select in the dialog
  await selects.nth(0).selectOption({ label: /Mappillai Samba/ }).catch(async () => {
    const opts = await selects.nth(0).locator("option").allTextContents();
    await selects.nth(0).selectOption({ index: Math.min(2, opts.length - 1) });
    console.log("   fell back to option index; options:", opts.slice(0, 4));
  });
  await selects.nth(1).selectOption({ label: /Deccan Dryland/ }).catch(async () => {
    await selects.nth(1).selectOption({ index: 3 });
  });
  const qtyInput = page.locator("input[type=number]").first();
  await qtyInput.fill("4");
  await page.waitForTimeout(200);

  step(4, "submit the request");
  await page.getByRole("button", { name: /open rescue request/i }).last().click();
  await page.waitForTimeout(2000);
  const afterCreate = await page.textContent("body");
  console.log("   request created:", /RSQ-\d{4}/.test(afterCreate ?? ""));

  step(5, "search the network for donors");
  const searchBtn = page.getByRole("button", { name: /search the network|find donor|search/i }).first();
  if (await searchBtn.count()) {
    await searchBtn.click();
    await page.waitForTimeout(2000);
  }
  const afterSearch = await page.textContent("body");
  const hasDonor = /Why this donor|fit|Select this donor/i.test(afterSearch ?? "");
  console.log("   donor cards rendered:", hasDonor);

  step(6, "select the first donor");
  const selectDonor = page.getByRole("button", { name: /select this donor/i }).first();
  if (await selectDonor.count()) {
    await selectDonor.click();
    await page.waitForTimeout(900);
    await page.getByRole("button", { name: /^propose donor$/i }).last().click();
    await page.waitForTimeout(1800);
    console.log("   proposal submitted");
  } else {
    console.log("   no 'Select this donor' button found");
  }

  step(7, "approve -> dispatch -> receive");
  for (const label of [/^approve/i, /dispatch/i, /mark received/i]) {
    const btn = page.getByRole("button", { name: label }).first();
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(1400);
      // possible confirmation modal (e.g. the irreversible receive dialog)
      const dialogConfirm = page.getByRole("button", { name: /^mark received$/i }).last();
      if (await dialogConfirm.count()) {
        await dialogConfirm.click().catch(() => {});
        await page.waitForTimeout(1600);
      }
      console.log(`   acted on ${label}`);
    } else {
      console.log(`   no button matching ${label}`);
    }
  }

  const finalText = await page.textContent("body");
  console.log("\nFINAL PAGE SHOWS 'Received':", /Received/i.test(finalText ?? ""));
  console.log("ACTIVITY/TRANSFER VISIBLE:", /TRF-|transfer/i.test(finalText ?? ""));
} catch (err) {
  console.log("TEST ERROR:", err.message.slice(0, 400));
  await page.screenshot({ path: "rescue_test_failure.png", fullPage: true }).catch(() => {});
  console.log("screenshot saved to rescue_test_failure.png");
}

console.log("\nCONSOLE/PAGE ERRORS:", errors.length);
errors.slice(0, 6).forEach((e) => console.log("  !", e.slice(0, 200)));
await browser.close();
