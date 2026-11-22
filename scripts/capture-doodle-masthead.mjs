/**
 * Rendus réels du mât (Playwright/Chromium) pour le doodle de novembre.
 *
 * Branche PR 512 : ?doodle=on&doodle-city=montreal|quebec
 *   390 / 768 / 1440, clair et sombre.
 * main (sans doodle) : 390 / 1440, clair et sombre, pour comparaison.
 *
 *   DOODLE_ORIGIN=http://127.0.0.1:4173 \
 *   MAIN_ORIGIN=http://127.0.0.1:4174 \
 *   node capture-doodle-masthead.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MASTHEAD_OUT
  || join(ROOT, "cine/villes/vaporwave/browser");
const DOODLE_ORIGIN = process.env.DOODLE_ORIGIN || "http://127.0.0.1:4173";
const MAIN_ORIGIN = process.env.MAIN_ORIGIN || "http://127.0.0.1:4174";

const LAB_HIDE = `#local-lab-format-bar,#midwidth-preview-bar,#wide-desktop-bar,#local-lab-shell,#toast,.local-lab-bar{display:none!important}`;

const VIEWPORTS = {
  390: { width: 390, height: 844 },
  768: { width: 768, height: 1024 },
  1440: { width: 1440, height: 900 },
};

async function openPage(browser, { origin, path, width, theme }) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[width],
    colorScheme: theme,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.addInitScript((t) => {
    try { localStorage.setItem("radar-theme", t); } catch { /* ignore */ }
    try { navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())); } catch { /* ignore */ }
  }, theme);
  await page.addInitScript((css) => {
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
  }, LAB_HIDE);
  await page.goto(`${origin}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForSelector(".masthead", { timeout: 20000 });
  await page.waitForFunction(
    (t) => document.documentElement.getAttribute("data-theme") === t,
    theme,
    { timeout: 10000 },
  ).catch(() => {});
  // Force theme in case init lost the race.
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  if (path.includes("doodle=on")) {
    await page.waitForFunction(
      () => document.documentElement.classList.contains("doodle-on")
        && !!document.documentElement.getAttribute("data-doodle-city"),
      null,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => {
        const bg = document.getElementById("bg-photo-layer");
        if (!bg) return false;
        const st = getComputedStyle(bg);
        return st.backgroundImage.includes("doodle") || bg.classList.contains("loaded");
      },
      null,
      { timeout: 15000 },
    );
    // Kaushan Script must be ready for the city line.
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.load) {
        try { await document.fonts.load('16px "Kaushan Script"'); } catch { /* ignore */ }
        await document.fonts.ready;
      }
    });
  }
  // Le bouton shuffle est déplacé dans .masthead-actions après l’ancrage
  // de la météo (mobile). On attend qu’il soit visible.
  await page.waitForFunction(() => {
    const btn = document.getElementById("masthead-bg-shuffle");
    if (!btn || btn.hidden) return false;
    const cs = getComputedStyle(btn);
    const r = btn.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 1 && r.height > 1;
  }, null, { timeout: 8000 }).catch(() => {});
  // Settle layout / photos.
  await page.waitForTimeout(400);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return { context, page };
}

async function shotMasthead(page, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const masthead = page.locator(".masthead").first();
  await masthead.waitFor({ state: "visible" });
  await masthead.screenshot({ path: dest, type: "png" });
  const box = await masthead.boundingBox();
  console.log("wrote", dest, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "");
}

async function measureLogo(page) {
  return page.evaluate(() => {
    const logo = document.querySelector(".wordmark-logo");
    const brand = document.querySelector(".wordmark-brand");
    if (!logo || !brand) return { ok: false, reason: "missing" };
    const cs = getComputedStyle(logo);
    const a = logo.getBoundingClientRect();
    const b = brand.getBoundingClientRect();
    const hidden = cs.display === "none" || a.width < 1 || a.height < 1;
    const leftOfTitle = a.right <= b.left + 1 && Math.abs(a.top + a.height / 2 - (b.top + b.height / 2)) < a.height;
    return {
      ok: !hidden && a.left < b.left,
      hidden,
      logo: { x: a.x, y: a.y, w: a.width, h: a.height },
      brand: { x: b.x, y: b.y, w: b.width, h: b.height },
      leftOfTitle: a.left < b.left,
      sameRow: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) < Math.max(a.height, b.height) * 0.7,
    };
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const themeName = { light: "clair", dark: "sombre" };
  const checks = [];

  try {
    for (const city of ["montreal", "quebec"]) {
      for (const width of [390, 768, 1440]) {
        for (const theme of ["light", "dark"]) {
          const dest = join(OUT, city, `mat-${width}-${themeName[theme]}.png`);
          const { context, page } = await openPage(browser, {
            origin: DOODLE_ORIGIN,
            path: `/?doodle=on&doodle-city=${city}`,
            width,
            theme,
          });
          if (width === 390) {
            const m = await measureLogo(page);
            checks.push({ city, width, theme, ...m });
            console.log("logo", city, width, theme, JSON.stringify(m));
          }
          await shotMasthead(page, dest);
          await context.close();
        }
      }
    }

    if (MAIN_ORIGIN) {
      for (const width of [390, 1440]) {
        for (const theme of ["light", "dark"]) {
          const dest = join(OUT, "main", `mat-${width}-${themeName[theme]}.png`);
          const { context, page } = await openPage(browser, {
            origin: MAIN_ORIGIN,
            path: "/?doodle=off",
            width,
            theme,
          });
          await shotMasthead(page, dest);
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const failed = checks.filter((c) => !c.ok || c.hidden || !c.leftOfTitle || !c.sameRow);
  if (failed.length) {
    console.error("LOGO CHECK FAILED", JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  } else {
    console.log("logo check ok: Radar logo to the left of the Pricedown title on 390, all cities/themes");
  }
  console.log("DONE", OUT);
}

await main();
