import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const output = "test-results/landing-homologation";
await mkdir(output, { recursive: true });
const sizes = [[360, 800], [390, 844], [412, 915], [768, 1024], [1024, 768], [1440, 900]];
const results = [];
for (const [width, height] of sizes) {
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.addInitScript(value => localStorage.setItem("checkflow:theme", value), theme);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
    const measurement = await page.evaluate(() => {
      const card = document.querySelector(".marketing-steps li");
      const title = card.querySelector("h3");
      const description = card.querySelector("p");
      const number = card.querySelector("span");
      const styles = element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor });
      const rgb = value => value.match(/\d+/g).slice(0, 3).map(Number);
      const luminance = value => rgb(value).map(channel => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const contrast = (foreground, background) => { const a = luminance(foreground), b = luminance(background); return Number(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)); };
      const background = styles(card).background;
      return { documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, contrast: { title: contrast(styles(title).color, background), description: contrast(styles(description).color, background), number: contrast(styles(number).color, background) }, links: [...document.querySelectorAll(".marketing-shell a")].map(a => a.getAttribute("href")) };
    });
    if (theme === "light" && [360, 390, 412, 1440].includes(width)) await page.screenshot({ path: `${output}/landing-${width === 1440 ? "desktop" : "mobile"}-${width}.png`, fullPage: true });
    if (theme === "dark" && width === 390) await page.screenshot({ path: `${output}/landing-mobile-390-dark.png`, fullPage: true });
    if (measurement.documentWidth > width || Object.values(measurement.contrast).some(value => value < 4.5) || errors.length) process.exitCode = 1;
    results.push({ width, height, theme, ...measurement, errors });
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
