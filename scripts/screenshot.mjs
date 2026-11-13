#!/usr/bin/env node
/**
 * UI check: screenshot pages of the running app with the locally installed Chrome.
 *
 *   node scripts/screenshot.mjs <url> <out.png> [--mobile] [--wait <ms>] [--click "<text>"]...
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const [url, out] = args;
const mobile = args.includes("--mobile");
const waitIdx = args.indexOf("--wait");
const wait = waitIdx > 0 ? Number(args[waitIdx + 1]) : 1500;
const clicks = args.flatMap((a, i) => (a === "--click" ? [args[i + 1]] : []));

const exe = [
  process.env.STAGES_BROWSER,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const page = await browser.newPage();
  await page.setViewport(mobile ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1366, height: 900 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  for (const text of clicks) {
    const clicked = await page.evaluate((t) => {
      const el = [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(t));
      if (el) el.click();
      return !!el;
    }, text);
    if (!clicked) errors.push(`no button "${text}"`);
    await new Promise((r) => setTimeout(r, 600));
  }
  await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: out, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(JSON.stringify({ out, errors: errors.slice(0, 10), horizontalOverflow: overflow }));
} finally {
  await browser.close();
}
