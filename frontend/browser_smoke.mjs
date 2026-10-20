/* Runtime smoke test using the system Edge browser.
 * Visits every route, captures console errors / uncaught exceptions, and
 * verifies that key content actually rendered.
 * Run: node browser_smoke.mjs
 */
import { chromium } from "playwright-core";

const BASE = "http://localhost:5173";
const ROUTES = [
  { path: "/", expect: "Network Dashboard" },
  { path: "/inventory", expect: "Seed Inventory" },
  { path: "/monitoring", expect: "IoT Storage Monitoring" },
  { path: "/alerts", expect: "Alerts" },
  { path: "/rescue", expect: "Seed Rescue Network" },
  { path: "/simulation", expect: "Seed Rescue Simulation" },
  { path: "/directory", expect: "Seed Bank" },
  { path: "/analytics", expect: "Analytics" },
];

const browser = await chromium.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

let totalErrors = 0;
const results = [];

for (const route of ROUTES) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  try {
    await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1200);
    const body = await page.textContent("body");
    const rendered = body && body.length > 200;
    const hasExpected = body?.includes(route.expect);
    const spinnerLeft = body?.includes("Loading…") || body?.includes("Loading...");

    results.push({
      route: route.path,
      rendered,
      hasExpected,
      spinnerLeft: !!spinnerLeft,
      textLen: body?.length ?? 0,
      errors,
    });
  } catch (err) {
    errors.push(`navigation: ${err.message}`);
    results.push({ route: route.path, rendered: false, hasExpected: false, errors });
  }
  totalErrors += errors.length;
  await page.close();
}

for (const r of results) {
  const flag = r.rendered && r.hasExpected && r.errors.length === 0 ? "PASS" : "FAIL";
  console.log(
    `${flag} ${r.route.padEnd(14)} rendered=${r.rendered} expectedText=${r.hasExpected} ` +
      `chars=${r.textLen ?? 0} errors=${r.errors.length}`,
  );
  for (const e of r.errors.slice(0, 4)) console.log(`     ! ${e.slice(0, 220)}`);
}

console.log(`\nTOTAL CONSOLE/PAGE ERRORS: ${totalErrors}`);
await browser.close();
process.exit(totalErrors === 0 && results.every((r) => r.rendered && r.hasExpected) ? 0 : 1);
