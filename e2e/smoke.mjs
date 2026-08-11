// End-to-end smoke test: boots the real server, drives a demo game in a
// headless browser through start → roll order, and fails on any board that
// doesn't mount or any console/page error. Runs in CI on every push, and
// locally via `npm run test:e2e` (needs a built server + client).
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = process.env.E2E_PORT || "4599";
const BASE = `http://localhost:${PORT}`;

function waitForServer(timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tryOnce = () => {
      http
        .get(`${BASE}/health`, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - t0 > timeoutMs) reject(new Error("server did not become ready"));
          else setTimeout(tryOnce, 300);
        });
    };
    tryOnce();
  });
}

const server = spawn("node", ["server/dist/index.js"], {
  env: { ...process.env, PORT },
  stdio: "inherit",
});

let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Demo starten/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Spiel starten/i }).click();
  await page.waitForTimeout(800);

  const board = await page.locator(".hex-board").count();
  const timeline = await page.locator(".player-timeline").count();
  if (!board || !timeline) throw new Error(`expected board + timeline, got board=${board} timeline=${timeline}`);
  if (errors.length) throw new Error(`console/page errors:\n${errors.join("\n")}`);

  console.log("✅ E2E smoke passed: demo game mounts, board + timeline present, no runtime errors.");
  await browser.close();
} catch (e) {
  console.error("❌ E2E smoke FAILED:", e.message);
  failed = true;
} finally {
  server.kill("SIGTERM");
}

process.exit(failed ? 1 : 0);
