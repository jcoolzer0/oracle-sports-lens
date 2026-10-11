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
          if (route.request().url().includes("/history/2025/gb.json"))
            await new Promise((resolve) => setTimeout(resolve, 250));
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
  if (!(await page.locator("#appShell").evaluate((el) => el.inert)))
    throw Error("Locked content must be inert");
  await page.locator("#pw").focus();
  await page.keyboard.press("Shift+Tab");
  if (
    !(await page
      .locator("#login button")
      .evaluate((el) => el === document.activeElement))
  )
    throw Error("Login focus trap");
  await page.keyboard.press("Tab");
  if (
    !(await page.locator("#pw").evaluate((el) => el === document.activeElement))
  )
    throw Error("Login focus return");
  await page.fill("#pw", "wrong");
  await page.locator("#login button").click();
  if (!(await page.locator("#gateErr").isVisible()))
    throw Error("Login error feedback");
  await page.fill("#pw", "oraclefootball");
  await page.locator("#login button").click();
  if (await page.locator("#gate").isVisible()) throw Error("Gate");
  if ((await page.locator("#team option").count()) !== 32)
    throw Error("32 teams");
  const fullCount = await page.locator("#schedule tbody tr[data-game]").count();
  if (fullCount !== 272) throw Error("Full season schedule");
  if (
    (await page.evaluate(() =>
      localStorage.getItem("oracle-predictions-v1"),
    )) !== null
  )
    throw Error("Browsing must not create predictions");
  await page.selectOption("#weekFilter", "1");
  const weekCount = await page.locator("#schedule tbody tr[data-game]").count();
  if (weekCount !== 16) throw Error("Week filter");
  const row = page.locator("#schedule tbody tr[data-game]").first();
  const id = await row.getAttribute("data-game");
  await row.locator("td").nth(1).locator("button").focus();
  await page.keyboard.press("Enter");
  if ((await page.locator("#matchup").inputValue()) !== id)
    throw Error("Prediction drill down");
  if (
    !(await page
      .locator("#detailTitle")
      .evaluate((el) => el === document.activeElement))
  )
    throw Error("Detail focus");
  if (!(await page.locator("#save").isDisabled()))
    throw Error("Historical preview cannot be recorded");
  await page
    .locator("#prediction summary")
    .filter({ hasText: "Inspect source data" })
    .click();
  if (
    !(await page.locator("#prediction pre").last().innerText()).includes(
      "schema_version",
    )
  )
    throw Error("Source metadata");
  await page.locator("#resetFilters").click();
  const teamButton = page
    .locator("#schedule tbody tr[data-game]")
    .first()
    .locator("td")
    .first()
    .locator("button")
    .first();
  const clickedTeam = await teamButton.innerText();
  await teamButton.click();
  if (
    (await page.locator("#team").inputValue()) !== clickedTeam ||
    (await page.locator("#schedule tbody tr[data-game]").count()) !== 17
  )
    throw Error("Team season drill down");
  await page.locator("#resetFilters").click();
  if ((await page.locator("#schedule tbody tr[data-game]").count()) !== 272)
    throw Error("Reset full season");
  console.log(
    "Full season, filters, keyboard prediction drill-down, raw data and team season passed",
  );
  await page.locator("#nextGames").click();
  if (
    !(await page.evaluate(() =>
      document.activeElement.closest("tr[data-game]"),
    ))
  )
    throw Error("Upcoming jump focus");
  if (process.env.ORACLE_AXE_PATH) {
    await page.addScriptTag({ path: process.env.ORACLE_AXE_PATH });
    const report = await page.evaluate(
      async () =>
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
    );
    console.log(
      "Accessibility findings:",
      JSON.stringify(
        report.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      ),
    );
    if (report.violations.length) throw Error("Accessibility audit");
  }
  if (process.env.ORACLE_CAPTURE) {
    await page.locator("#backSchedule").click();
    await page.screenshot({ path: "/tmp/oracle-schedule-desktop.png" });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
  )
    throw Error("Mobile page overflow");
  if (process.env.ORACLE_CAPTURE)
    await page.screenshot({ path: "/tmp/oracle-schedule-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
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
    const savedGame = await page.locator("#matchup").inputValue();
    if (
      !(await page.locator(`[data-game="${savedGame}"]`).innerText()).includes(
        "Recorded pregame call",
      )
    )
      throw Error("Saved call missing from schedule");
    console.log("Pregame append-only recording passed");
  }
  await page.locator('[data-lens="legacy"]').click();
  const frame = page.frameLocator("#legacy");
  await frame.locator("#loadedTag").filter({ hasText: "GB" }).waitFor();
  if ((await frame.locator("#tbl tbody tr").count()) === 0)
    throw Error("Legacy rows");
  if ((await frame.locator('input[type="password"]').count()) !== 0)
    throw Error("Legacy has a second password");
  await page.locator('[data-lens="precog"]').click();
  await page.locator('[data-lens="legacy"]').click();
  if (await page.locator("#gate").isVisible())
    throw Error("Lens switch requested another login");
  await frame.locator("#tbl tbody tr").first().locator("button").focus();
  await page.keyboard.press("Enter");
  if (
    !(await frame
      .locator("#legacyLensTitle")
      .evaluate((el) => el === document.activeElement))
  )
    throw Error("Legacy keyboard drill-down focus");
  await frame.locator("#teamSel").selectOption("GB");
  await frame.locator("#teamSel").selectOption("NE");
  await frame.locator("#loadedTag").filter({ hasText: "NE" }).waitFor();
  await page.waitForTimeout(400);
  if (!(await frame.locator("#loadedTag").innerText()).includes("NE"))
    throw Error("Stale Legacy team response");
  if ((await page.locator("#team").inputValue()) !== "NE")
    throw Error("Shared Legacy team navigation");
  if (process.env.ORACLE_AXE_PATH) {
    const legacyFrame = page
      .frames()
      .find((f) => f.url().endsWith("/legacy.html"));
    await legacyFrame.addScriptTag({ path: process.env.ORACLE_AXE_PATH });
    const report = await legacyFrame.evaluate(
      async () =>
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
    );
    console.log(
      "Legacy accessibility findings:",
      JSON.stringify(
        report.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      ),
    );
    if (report.violations.length) throw Error("Legacy accessibility audit");
  }
  await frame.locator("#nextTeam").click();
  await frame.locator("#loadedTag").filter({ hasText: "LV" }).waitFor();
  if ((await page.locator("#team").inputValue()) !== "LV")
    throw Error("Legacy next-team navigation");
  console.log("Legacy rows:", await frame.locator("#tbl tbody tr").count());
  await page.locator('[data-lens="community"]').click();
  if (!(await page.locator("#community").isVisible())) throw Error("community");
  await page.goto(
    new URL(
      "legacy.html",
      process.env.ORACLE_TEST_URL ?? "http://127.0.0.1:8000",
    ).href,
  );
  await page.waitForURL("**/index.html?lens=legacy");
  if (await page.locator("#gate").isVisible())
    throw Error("Standalone Legacy should reuse login");
  await page
    .frameLocator("#legacy")
    .locator("#loadedTag")
    .filter({ hasText: "ATL" })
    .waitFor();
  console.log("One login across switches and standalone Legacy passed");
  const offline = await browser.newPage();
  offline.on("pageerror", (e) => errors.push(e.message));
  await offline.route(
    /https:\/\/(jcoolzer0\.github\.io|raw\.githubusercontent\.com)\//,
    (route) => route.fulfill({ status: 503, body: "offline test" }),
  );
  await offline.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw Error("Session storage unavailable");
      },
    }),
  );
  await offline.goto(process.env.ORACLE_TEST_URL ?? "http://127.0.0.1:8000");
  await offline.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("unavailable"),
  );
  await offline.fill("#pw", "oraclefootball");
  await offline.locator("#login button").click();
  await offline.locator('[data-lens="legacy"]').click();
  await offline
    .frameLocator("#legacy")
    .locator("#loadedTag")
    .filter({ hasText: "ATL" })
    .waitFor();
  if (
    await offline
      .frameLocator("#legacy")
      .locator('input[type="password"]')
      .count()
  )
    throw Error("Offline Legacy requested password");
  console.log(
    "Unavailable network and disabled session storage fallback passed",
  );
  await offline.close();
  console.log("Page errors:", errors);
  await browser.close();
  if (errors.length) throw Error(errors.join(";"));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
