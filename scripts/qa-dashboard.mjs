import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => errors.push(`page: ${e.message}`));

async function shot(name) {
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: false });
}

try {
  await page.goto("http://127.0.0.1:8080/login", { waitUntil: "networkidle", timeout: 45000 });
  await page.getByRole("button", { name: /Need an account/i }).click();
  const email = `ops${Date.now()}@swifroute.test`;
  await page.locator("#name").fill("Priya Mehta");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("control-room-92");
  await page.getByRole("button", { name: /Create account/i }).click();
  await page.waitForURL("**/overview", { timeout: 60000 });
  // Seed can take a bit on first profile fetch
  await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 90000 });
  await page.waitForTimeout(1500);
  await shot("overview");

  const otd = await page.locator("text=On-time delivery").count();
  console.log("overview_kpi_present", otd > 0);
  console.log("overview_text_len", (await page.locator("body").innerText()).length);

  await page.getByRole("link", { name: "Trends" }).click();
  await page.getByRole("heading", { name: "Trends" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await shot("trends");

  await page.getByRole("link", { name: "Deliveries" }).click();
  await page.getByRole("heading", { name: "Deliveries" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  await shot("deliveries");

  await page.getByRole("link", { name: "Pipeline" }).click();
  await page.getByRole("heading", { name: "Pipeline health" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  await shot("pipeline");

  await page.getByRole("link", { name: "Operator" }).click();
  await page.getByRole("heading", { name: "Operator" }).waitFor({ timeout: 30000 });
  await shot("operator");
  await page.getByRole("button", { name: /^Queue$/ }).first().click();
  await page.getByRole("button", { name: /Run pipeline now/i }).click();
  await page.getByText(/silver/i).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(800);
  await shot("operator-after-run");

  await page.getByRole("link", { name: "Quality" }).click();
  await page.getByRole("heading", { name: "Quality scorecard" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  await shot("quality");

  await page.getByRole("link", { name: "Alerts" }).click();
  await page.getByRole("heading", { name: "Alerts" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(400);
  await shot("alerts");

  // Mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:8080/overview", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Overview" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  await shot("overview-mobile");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  console.log("mobile_overflow", overflow);

  console.log(JSON.stringify({ ok: true, errors }, null, 2));
} catch (err) {
  await shot("qa-error");
  console.error(JSON.stringify({ ok: false, error: String(err), errors }, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
