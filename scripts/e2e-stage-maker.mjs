#!/usr/bin/env node
/**
 * End-to-end check of the Custom Stage maker (roadmap Phase 6):
 * upload an object photo, drag 4 windows, pick "On the beat", save, and
 * confirm the project now uses the new Stage.
 *
 *   node scripts/e2e-stage-maker.mjs <baseUrl> <projectId> <objectPhoto> <screenshot.png>
 */
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const [base, projectId, photo, shot] = process.argv.slice(2);
const exe = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, headless: true });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 1000 });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/stages/new?project=${projectId}`, { waitUntil: "networkidle2" });

  const input = await page.$('input[type="file"]');
  await input.uploadFile(photo);
  await page.waitForSelector("svg", { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));

  const box = await (await page.$("svg")).boundingBox();
  // four windows side by side across the middle
  for (let i = 0; i < 4; i++) {
    const x0 = box.x + box.width * (0.08 + i * 0.22);
    const y0 = box.y + box.height * 0.42;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + box.width * 0.18, y0 + box.height * 0.16, { steps: 4 });
    await page.mouse.up();
  }
  const count = await page.$$eval("svg polygon", (els) => els.length);

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("On the beat"))?.click());
  await page.evaluate(() => {
    const name = document.querySelector('input[aria-label="Stage name"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(name, "Shelf windows");
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: shot, fullPage: true });

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save Stage")?.click());
  await page.waitForFunction(() => location.pathname.startsWith("/p/"), { timeout: 30000 });
  const project = await (await fetch(`${base}/api/projects/${projectId}`)).json();
  const stages = await (await fetch(`${base}/api/stages`)).json();
  const stage = stages.find((s) => s.id === project.stageId);
  console.log(JSON.stringify({ windowsDrawn: count, landedOn: page.url(), projectStage: project.stageId, stageName: stage?.name, behavior: stage?.behavior, windows: stage?.look?.windows?.length, errors }));
} finally {
  await browser.close();
}
