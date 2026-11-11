"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

let browser;

test.before(async () => {
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

async function startStaticApp(t) {
  const app = express();
  app.use(express.static(path.join(__dirname, "..", "public")));
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return "http://127.0.0.1:" + server.address().port;
}

async function installApiMocks(page) {
  const sent = [];
  await page.route("**/socket.io/socket.io.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: `window.io = function () {
      const handlers = {};
      return {
        connected: true,
        on: function (name, fn) { (handlers[name] ||= []).push(fn); return this; },
        off: function () { return this; },
        emit: function () { return this; },
        disconnect: function () { return this; },
        connect: function () { return this; },
        once: function (name, fn) { (handlers[name] ||= []).push(fn); return this; }
      };
    };`
  }));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body = {};
    try { body = request.postDataJSON() || {}; } catch {}
    if (url.pathname === "/api/auth/login" && method === "POST") {
      if (body.username !== "alice" || body.password !== "CorrectPass123!") {
        return route.fulfill({ status: 401, json: { error: "Invalid username or password." } });
      }
      return route.fulfill({ json: { token: "browser-test-token", user: { id: "101", username: "alice" } } });
    }
    if (url.pathname === "/api/auth/register" && method === "POST") {
      return route.fulfill({ status: 201, json: { message: "Account created successfully." } });
    }
    if (url.pathname === "/api/auth/profile") {
      return route.fulfill({ json: { user: {
        id: "101", username: "alice", fullName: "Alice Test", bio: "Browser test profile",
        profileBackground: "mist", privacy: "public", profileColor: "teal"
      } } });
    }
    if (url.pathname === "/api/messages/users") {
      return route.fulfill({ json: { users: [{ id: "202", username: "bob", bio: "Test recipient" }] } });
    }
    if (url.pathname.startsWith("/api/messages/conversation/") && method === "GET") {
      return route.fulfill({ json: { messages: [{ id: "1", sender: "bob", body: "Hello Alice", createdAt: new Date().toISOString() }] } });
    }
    if (url.pathname === "/api/messages" && method === "POST") {
      sent.push(body);
      return route.fulfill({ status: 201, json: { message: { id: "2", sender: "alice", body: body.body } } });
    }
    if (url.pathname.startsWith("/api/messages/conversation/") && method === "POST") {
      return route.fulfill({ json: { success: true } });
    }
    if (url.pathname === "/api/presence/online") return route.fulfill({ json: { users: [] } });
    if (url.pathname.startsWith("/api/groups")) return route.fulfill({ json: { groups: [], group: null, members: [], events: [], polls: [] } });
    if (url.pathname.startsWith("/api/channels")) return route.fulfill({ json: { channels: [], messages: [] } });
    if (url.pathname.startsWith("/api/social")) return route.fulfill({ json: { posts: [], users: [], following: [], followers: [] } });
    if (url.pathname.startsWith("/api/moments")) return route.fulfill({ json: { moments: [] } });
    return route.fulfill({ json: { success: true, users: [], messages: [], groups: [], channels: [], posts: [], moments: [] } });
  });
  return sent;
}

test("desktop browser: login, profile loads, select recipient and send a direct message", async t => {
  const base = await startStaticApp(t);
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  t.after(() => page.close());
  const sent = await installApiMocks(page);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(base);
  await page.locator("#username").fill("alice");
  await page.locator("#password").fill("CorrectPass123!");
  await page.locator('#login-form button[type="submit"]').click();

  await assert.doesNotReject(() => page.locator("#chat-panel").waitFor({ state: "visible" }));
  await page.locator('a[href="#wt-communication-section"]').click();
  await page.waitForFunction(() => Array.from(document.querySelector("#recipient")?.options || []).some(option => option.value === "bob"));
  await page.locator("#recipient").selectOption("bob");
  await page.locator("#message-input").fill("Hello from browser test");
  await page.locator('#message-form button[type="submit"]').click();

  await page.waitForFunction(() => document.querySelector("#status")?.textContent.includes("sent"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].receiverUsername, "bob");
  assert.equal(sent[0].body, "Hello from browser test");
  assert.equal(await page.locator("#auth-panel").evaluate(el => getComputedStyle(el).display), "none");
  assert.deepEqual(errors, []);
});

test("mobile browser: registration form switches and displays API validation errors", async t => {
  const base = await startStaticApp(t);
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  t.after(() => page.close());
  await installApiMocks(page);

  await page.goto(base);
  await page.locator("#show-register").click();
  await page.locator("#register-form").waitFor({ state: "visible" });
  await page.locator("#new-username").fill("newuser");
  await page.locator("#new-password").fill("NewPassword123!");
  await page.locator('#register-form button[type="submit"]').click();
  await page.getByText("Account created successfully.", { exact: false }).waitFor();
  await page.locator("#login-form").waitFor({ state: "visible" });
  assert.ok(await page.locator("#username").isVisible());
  assert.ok(await page.locator("#password").isVisible());
});
