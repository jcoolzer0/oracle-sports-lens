const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    headless: true,
    proxy: process.env.HTTPS_PROXY
      ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" }
      : undefined,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("requestfailed", (r) =>
    console.log(
      "request failure",
      new URL(r.url()).hostname,
      r.failure()?.errorText,
    ),
  );
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.dismiss());
  if (process.env.ORACLE_CURL_TRANSPORT === "1") {
    const { execFileSync } = require("node:child_process");
    await page.route(
      /https:\/\/(jcoolzer0\.github\.io|raw\.githubusercontent\.com)\//,
      async (route) => {
        try {
          const body = execFileSync(
            "curl",
            ["-fsSL", "--max-time", "20", route.request().url()],
            { stdio: ["ignore", "pipe", "ignore"] },
          );
          await route.fulfill({
            body,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
          });
        } catch {
          await route.fulfill({
            status: 503,
            body: "Verified HTTPS transport unavailable",
          });
        }
      },
    );
    console.log(
      "Transport: verified curl HTTPS delivered through browser request interception",
    );
  }
  await page.goto(process.env.ORACLE_TEST_URL ?? "http://127.0.0.1:8000");
  await page.waitForFunction(
    () => !document.querySelector("#status").textContent.startsWith("Loading"),
    { timeout: 30000 },
  );
  console.log("Live:", await page.locator("#status").innerText());
  if (!(await page.locator("#status").innerText()).includes("loaded"))
    throw Error("DataBank did not load");
  await page.fill("#pw", "oraclefootball");
  await page.locator("#login button").click();
  if (await page.locator("#gate").isVisible()) throw Error("Gate");
  if ((await page.locator("#team option").count()) !== 32)
    throw Error("32 teams");
  console.log(
    "Prediction:",
    (await page.locator("#prediction").innerText()).slice(0, 220),
  );
  await page.selectOption("#team", "GB");
  if (!(await page.locator("#prediction").innerText()).includes("GB"))
    throw Error("Team navigation");
  if (!(await page.locator("#save").isDisabled())) {
    await page.locator("#save").click();
    await page.locator("#save").click();
    const n = await page.evaluate(
      () => JSON.parse(localStorage.getItem("oracle-predictions-v1")).length,
    );
    if (n !== 1) throw Error("duplicate record");
    console.log("Pregame append-only recording passed");
  }
  await page.locator('[data-lens="legacy"]').click();
  const frame = page.frameLocator("#legacy");
  await frame.locator("#loadedTag").filter({ hasText: "GB" }).waitFor();
  if ((await frame.locator("#tbl tbody tr").count()) === 0)
    throw Error("Legacy rows");
  if (await frame.locator("#gate").isVisible())
    throw Error("Legacy gate not unlocked");
  console.log("Legacy GB rows:", await frame.locator("#tbl tbody tr").count());
  await page.locator('[data-lens="community"]').click();
  if (!(await page.locator("#community").isVisible())) throw Error("community");
  console.log("Page errors:", errors);
  await browser.close();
  if (errors.length) throw Error(errors.join(";"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
