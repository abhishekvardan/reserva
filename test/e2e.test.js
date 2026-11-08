import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

process.env.PGLITE_DIR = "memory";
const { initDb, db } = await import("../src/db.js");
const { seed } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

let server, base, cookie, client;
const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
const out = (r) => JSON.parse(r.content[0].text);

before(async () => {
  await initDb();
  await seed();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://localhost:${server.address().port}`;
  const res = await fetch(`${base}/login`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "email=demo%40reserva.dev&password=demo1234&next=%2F" });
  assert.equal(res.status, 303);
  cookie = res.headers.get("set-cookie").split(";")[0];
});
after(async () => {
  await client?.close();
  server?.close();
  await db.close();
});

const api = async (path, method = "GET", body) => {
  const r = await fetch(`${base}/opendoor/api${path}`, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body && JSON.stringify(body) });
  return r.json();
};

test("website pages render and book like a normal site", async () => {
  const home = await (await fetch(`${base}/?party=4&date=${tomorrow}`)).text();
  assert.match(home, /Trattoria Sole/);
  assert.match(home, /\/mcp/);
  const page = await (await fetch(`${base}/r/kumo-sushi?date=${tomorrow}&party=2`)).text();
  assert.match(page, /Chef&#39;s omakase/);
  const book = await fetch(`${base}/r/kumo-sushi/book`, { method: "POST", redirect: "manual", headers: { cookie, "content-type": "application/x-www-form-urlencoded" }, body: `date=${tomorrow}&party=2&time=19:00` });
  assert.equal(book.status, 303); // POST → GET; Vercel defaults redirects to 307, which would re-POST
  assert.match(decodeURIComponent(book.headers.get("location")), /Booked Kumo Sushi/);
  const evil = await fetch(`${base}/r/kumo-sushi/book`, { method: "POST", headers: { cookie, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" }, body: "x=1" });
  assert.equal(evil.status, 403);
});

test("Claude connects via OAuth with a party-size limit; cancelling stays off by default", async () => {
  const reg = await (await fetch(`${base}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }) })).json();
  const verifier = crypto.randomBytes(32).toString("base64url");
  const params = { response_type: "code", client_id: reg.client_id, redirect_uri: reg.redirect_uris[0], state: "s", code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" };
  const loc = (await fetch(`${base}/oauth/authorize?${new URLSearchParams(params)}`, { redirect: "manual" })).headers.get("location");
  assert.match(loc, /\/opendoor\/authorize\?/);
  const consentPage = await fetch(loc, { headers: { cookie } });
  assert.equal(consentPage.status, 200);
  const info = await api(`/oauth/request?${new URLSearchParams(params)}`);
  assert.ok(!info.requested_scopes.includes("bookings:cancel") || info.scopes["bookings:cancel"].risk === "high");
  const decision = await api("/oauth/consent", "POST", { params, approve: true, scopes: ["restaurants:read", "bookings:read", "bookings:write", "profile:read"], limits: { party: 6 } });
  const code = new URL(decision.redirect).searchParams.get("code");
  const tok = await (await fetch(`${base}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: params.redirect_uri, client_id: reg.client_id, code_verifier: verifier }) })).json();
  client = new Client({ name: "claude", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  assert.ok(tools.includes("bookings_create") && !tools.includes("bookings_cancel"));
});

let code;
test("agent searches, checks availability and books", async () => {
  const s = out(await client.callTool({ name: "restaurants_search", arguments: { cuisine: "Italian", date: tomorrow, time: "20:00", party_size: 4 } }));
  assert.equal(s.restaurants[0].slug, "trattoria-sole");
  assert.ok(s.restaurants[0].available_times.includes("20:00"));
  const menu = out(await client.callTool({ name: "menu_get", arguments: { restaurant: "trattoria-sole", dietary: "vegetarian" } }));
  assert.ok(menu.items.every((i) => i.tags.includes("vegetarian")));
  const noConfirm = await client.callTool({ name: "bookings_create", arguments: { restaurant: "trattoria-sole", date: tomorrow, time: "20:00", party_size: 4 } });
  assert.equal(out(noConfirm).error.code, "INVALID_INPUT");
  const b = out(await client.callTool({ name: "bookings_create", arguments: { restaurant: "trattoria-sole", date: tomorrow, time: "20:00", party_size: 4, special_requests: "Window table", confirm: true } }));
  assert.match(b.code, /^RSV-/);
  assert.equal(b.placed_by, "agent");
  code = b.code;
  const page = await (await fetch(`${base}/bookings`, { headers: { cookie } })).text();
  assert.match(page, /via Claude/);
});

test("limits, permissions and availability are enforced", async () => {
  const big = await client.callTool({ name: "bookings_create", arguments: { restaurant: "saffron-house", date: tomorrow, time: "19:00", party_size: 8, confirm: true } });
  assert.equal(out(big).error.code, "LIMIT_EXCEEDED");
  const cancel = await client.callTool({ name: "bookings_cancel", arguments: { booking: code, confirm: true } });
  assert.equal(out(cancel).error.code, "INSUFFICIENT_SCOPE");
  // Le Petit Four has two 4-seat tables: the third booking for 4 at the same time must fail.
  for (let i = 0; i < 2; i++) {
    out(await client.callTool({ name: "bookings_create", arguments: { restaurant: "le-petit-four", date: tomorrow, time: "20:00", party_size: 4, confirm: true } }));
  }
  const full = await client.callTool({ name: "bookings_create", arguments: { restaurant: "le-petit-four", date: tomorrow, time: "20:00", party_size: 4, confirm: true } });
  assert.equal(out(full).error.code, "NOT_AVAILABLE");
  const moved = out(await client.callTool({ name: "bookings_update", arguments: { booking: code, time: "21:00", confirm: true } }));
  assert.equal(moved.time, "21:00");
  const log = await api("/activity?limit=50");
  const seen = log.entries.map((e) => `${e.action}:${e.status}`);
  for (const s of ["bookings.create:success", "bookings.create:denied", "bookings.cancel:denied", "bookings.update:success"]) assert.ok(seen.includes(s), s);
});
