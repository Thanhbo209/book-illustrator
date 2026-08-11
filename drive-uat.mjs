import { chromium } from "playwright";
import path from "node:path";

const shotDir = "C:\\Users\\Admin\\AppData\\Local\\Temp\\claude\\e--projects-book-illustrator\\80748619-6ef0-4619-8ff6-540662fa9e02\\scratchpad\\shots";
await import("node:fs/promises").then((fs) => fs.mkdir(shotDir, { recursive: true }));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE ERROR:", msg.text());
});
page.on("pageerror", (err) => console.log("PAGE ERROR:", err.message));

async function shot(name) {
  await page.screenshot({ path: path.join(shotDir, name), fullPage: true });
  console.log("saved", name);
}

await page.goto("http://localhost:3000/login");
await page.waitForSelector("text=Book Illustrator");
await shot("01-login.png");

await page.fill("#name", "Kenneth Grahame");
await page.fill("#email", `kenneth-${Date.now()}@example.com`);
await page.click('button:has-text("Continue")');

await page.waitForURL("**/projects");
await page.waitForSelector("text=No projects yet");
await shot("02-projects-empty.png");

await page.click('a[href="/projects/new"]');
await page.waitForURL("**/projects/new");
await shot("03-new-project.png");

await page.fill("#title", "The Wind in the Willows");
await page.click('button:has-text("Paste text")');
await page.fill("textarea", "The Mole had been working very hard all the morning, spring-cleaning his little home.");
await page.click('button:has-text("Create project")');

await page.waitForURL(/\/projects\/[a-z0-9]+$/);
await page.waitForSelector("text=The Wind in the Willows");
await shot("04-project-detail.png");

await page.goto("http://localhost:3000/projects");
await page.waitForSelector("text=The Wind in the Willows");
await shot("05-projects-list.png");

await page.click('button:has-text("Sign out")');
await page.waitForURL("**/login");
await shot("06-after-signout.png");

await browser.close();
console.log("DONE");
