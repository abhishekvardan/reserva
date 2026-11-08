import crypto from "node:crypto";
import express from "express";
import { openDoor, action, z } from "@abhishekvardanbotta/opendoor";
import { db } from "./db.js";
import { verifyPassword, hashPassword } from "./seed.js";
import * as booking from "./booking.js";
import { authPage, bookingsPage, homePage, restaurantPage } from "./views.js";

const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/");

/* ---------- The site's own sign-in (cookie sessions) ---------- */

async function currentUser(req) {
  if (req._user !== undefined) return req._user;
  const raw = /(?:^|;\s*)rsv=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
  req._user = raw
    ? await db.one("SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()", [sha(raw)])
    : null;
  return req._user;
}
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2, now() + interval '14 days')", [sha(token), userId]);
  res.cookie("rsv", token, { httpOnly: true, sameSite: "lax", secure: !!process.env.VERCEL, maxAge: 14 * 86400_000, path: "/" });
}

/* ---------- OpenDoor: what AI agents may do on Reserva ---------- */

const restaurantRef = z.string().min(1).max(80).describe('Restaurant slug (e.g. "trattoria-sole") from restaurants.search.');
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Date as YYYY-MM-DD.");
const timeField = z.string().regex(/^\d{2}:\d{2}$/).describe('24-hour time, e.g. "20:00". Pick one from availability.check.');
const party = z.number().int().min(1).max(12);
const bookingRef = z.string().min(1).max(40).describe('Booking code such as "RSV-1A2B3C".');

export const door = openDoor({
  name: "Reserva",
  db,
  getUser: currentUser,
  findUser: (id) => db.one("SELECT id, name, email FROM users WHERE id = $1", [id]),
  loginUrl: (next) => `/login?next=${encodeURIComponent(next)}`,
  publicUrl: baseUrl,
  accentColor: "#c2410c",
  scopes: {
    "restaurants:read": { label: "Find restaurants", description: "Search restaurants, read menus and check free tables." },
    "bookings:read": { label: "See your bookings", description: "List and read your reservations." },
    "bookings:write": { label: "Book tables for you", description: "Make new reservations and change existing ones.", risk: "medium" },
    "bookings:cancel": { label: "Cancel your bookings", description: "Cancel reservations on your behalf.", risk: "high" },
    "profile:read": { label: "Know your name", description: "Read your name and email for the booking." },
  },
  limits: { party: { label: "Largest party it may book", scope: "bookings:write", format: "number" } },
  instructions: `Reserva books restaurant tables for the signed-in user who connected you. Typical flow: restaurants_search (pass date and
party_size to see free times) → availability_check → confirm the details with the user → bookings_create with confirm: true.
Dates are YYYY-MM-DD, times are 24-hour HH:MM. If a tool says NOT_AVAILABLE, offer the alternative times it lists.`,
  actions: [
    action({
      name: "restaurants.search", title: "Find restaurants", scope: "restaurants:read", readOnly: true,
      description: "Search restaurants by text, cuisine, area or price. Pass date and party_size to get free times for each.",
      input: z.object({
        query: z.string().max(100).optional().describe('Free text, e.g. "pasta riverside".'),
        cuisine: z.string().max(40).optional(),
        neighborhood: z.string().max(40).optional(),
        max_price_level: z.number().int().min(1).max(4).optional().describe("1 = $, 4 = $$$$"),
        date: dateField.optional(),
        time: timeField.optional().describe("Preferred time; returns free times within an hour of it."),
        party_size: party.optional(),
      }),
      run: (_ctx, input) => booking.searchRestaurants(input).then((restaurants) => ({ restaurants })),
      summarize: (r) => `${r.restaurants.length} restaurants`,
    }),
    action({
      name: "restaurants.get", title: "Restaurant details", scope: "restaurants:read", readOnly: true,
      description: "Details for one restaurant: cuisine, area, price, rating, hours and largest table.",
      input: z.object({ restaurant: restaurantRef }),
      run: async (_ctx, { restaurant }) => { const { _row, ...r } = await booking.getRestaurant(restaurant); return r; },
      summarize: (r) => r.name,
    }),
    action({
      name: "menu.get", title: "Read the menu", scope: "restaurants:read", readOnly: true,
      description: "The restaurant's menu with prices. Optional dietary filter: vegetarian, vegan or gluten-free.",
      input: z.object({ restaurant: restaurantRef, dietary: z.enum(["vegetarian", "vegan", "gluten-free"]).optional() }),
      run: (_ctx, { restaurant, dietary }) => booking.menu(restaurant, { dietary }),
      summarize: (r) => `${r.items.length} dishes at ${r.restaurant_name}`,
    }),
    action({
      name: "availability.check", title: "Check free tables", scope: "restaurants:read", readOnly: true,
      description: "Free times at one restaurant for a date and party size.",
      input: z.object({ restaurant: restaurantRef, date: dateField, party_size: party }),
      run: (_ctx, { restaurant, date, party_size }) => booking.availability(restaurant, date, party_size),
      summarize: (r) => `${r.times.length} free times on ${r.date}`,
    }),
    action({
      name: "bookings.create", title: "Book a table", scope: "bookings:write", confirm: true,
      description: "Reserve a table. Confirm restaurant, date, time and party size with the user first.",
      input: z.object({ restaurant: restaurantRef, date: dateField, time: timeField, party_size: party, special_requests: z.string().max(300).optional() }),
      run: (ctx, input) => {
        ctx.enforceLimit("party", input.party_size);
        return booking.createBooking(ctx.user.id, input, { placedBy: "agent", agentName: ctx.agent.name });
      },
      summarize: (r) => `${r.code}: ${r.restaurant.name}, ${r.when}, ${r.party_size} guests`,
    }),
    action({
      name: "bookings.list", title: "My bookings", scope: "bookings:read", readOnly: true,
      description: "The user's upcoming reservations.",
      run: async (ctx) => ({ bookings: await booking.listBookings(ctx.user.id) }),
      summarize: (r) => `${r.bookings.length} bookings`,
    }),
    action({
      name: "bookings.get", title: "Get a booking", scope: "bookings:read", readOnly: true,
      description: "One reservation by its code.",
      input: z.object({ booking: bookingRef }),
      run: (ctx, { booking: ref }) => booking.getBooking(ctx.user.id, ref),
      summarize: (r) => `${r.code}: ${r.status}`,
    }),
    action({
      name: "bookings.update", title: "Change a booking", scope: "bookings:write", confirm: true,
      description: "Move a reservation to another date or time, or change the party size or requests.",
      input: z.object({ booking: bookingRef, date: dateField.optional(), time: timeField.optional(), party_size: party.optional(), special_requests: z.string().max(300).optional() }),
      run: (ctx, { booking: ref, ...changes }) => {
        if (changes.party_size) ctx.enforceLimit("party", changes.party_size);
        return booking.updateBooking(ctx.user.id, ref, changes);
      },
      summarize: (r) => `${r.code} → ${r.when}, ${r.party_size} guests`,
    }),
    action({
      name: "bookings.cancel", title: "Cancel a booking", scope: "bookings:cancel", confirm: true,
      description: "Cancel a reservation. Only after the user explicitly asks.",
      input: z.object({ booking: bookingRef }),
      run: (ctx, { booking: ref }) => booking.cancelBooking(ctx.user.id, ref),
      summarize: (r) => `${r.code} cancelled`,
    }),
    action({
      name: "profile.get", title: "Who am I", scope: "profile:read", readOnly: true,
      description: "The user's name and email.",
      run: (ctx) => ({ name: ctx.user.name, email: ctx.user.email }),
    }),
  ],
});

/* ---------- The website ---------- */

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
    next();
  });
  app.get("/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ ok: true, database: db.kind });
  });

  app.use(door.router); // MCP, OAuth, /opendoor dashboard + consent, REST actions, llms.txt

  app.use(express.urlencoded({ extended: false }));
  // Form posts must come from this site (CSRF defence alongside SameSite=Lax cookies).
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (req.method === "POST" && origin && new URL(origin).host !== req.get("host")) return res.status(403).send("Cross-site form rejected.");
    next();
  });
  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  app.get("/", wrap(async (req, res) => {
    const q = req.query;
    const date = q.date && q.date >= booking.today() ? String(q.date) : booking.today();
    const party_size = Math.min(Math.max(Number(q.party) || 2, 1), 12);
    const restaurants = await booking.searchRestaurants({ query: q.q, cuisine: q.cuisine || undefined, date, party_size });
    res.send(homePage({ user: await currentUser(req), restaurants, cuisines: await booking.cuisines(), q: { ...q, date, party: party_size }, base: baseUrl(req) }));
  }));

  app.get("/r/:slug", wrap(async (req, res) => {
    const r = await booking.getRestaurant(req.params.slug);
    const date = req.query.date && req.query.date >= booking.today() ? String(req.query.date) : booking.today();
    const party_size = Math.min(Math.max(Number(req.query.party) || 2, 1), 12);
    res.send(restaurantPage({ user: await currentUser(req), r, avail: await booking.availability(r, date, party_size), menu: await booking.menu(r.slug), msg: req.query.msg, base: baseUrl(req) }));
  }));

  app.post("/r/:slug/book", wrap(async (req, res) => {
    const user = await currentUser(req);
    const back = `/r/${encodeURIComponent(req.params.slug)}?date=${encodeURIComponent(req.body.date ?? "")}&party=${encodeURIComponent(req.body.party ?? "")}`;
    if (!user) return res.redirect(`/login?next=${encodeURIComponent(back)}`);
    try {
      const b = await booking.createBooking(user.id, {
        restaurant: req.params.slug, date: String(req.body.date), time: String(req.body.time), party_size: Number(req.body.party), special_requests: String(req.body.requests ?? "").slice(0, 300),
      });
      res.redirect(`/bookings?ok=${encodeURIComponent(`Booked ${b.restaurant.name}, ${b.when} for ${b.party_size}. Code ${b.code}.`)}`);
    } catch (err) {
      if (!(err instanceof booking.BookingError)) throw err;
      res.redirect(`${back}&msg=${encodeURIComponent(err.message)}`);
    }
  }));

  app.get("/bookings", wrap(async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.redirect("/login?next=/bookings");
    res.send(bookingsPage({ user, bookings: await booking.listBookings(user.id), flash: req.query.ok, base: baseUrl(req) }));
  }));

  app.post("/bookings/:code/cancel", wrap(async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.redirect("/login?next=/bookings");
    const b = await booking.cancelBooking(user.id, req.params.code);
    res.redirect(`/bookings?ok=${encodeURIComponent(`Cancelled ${b.restaurant.name}, ${b.when}.`)}`);
  }));

  app.get("/login", (req, res) => res.send(authPage({ mode: "login", next: safeNext(req.query.next) })));
  app.get("/register", (req, res) => res.send(authPage({ mode: "register", next: safeNext(req.query.next) })));
  const attempts = new Map();
  app.post("/login", wrap(async (req, res) => {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const key = `${req.ip}:${email}`;
    const hits = (attempts.get(key) ?? []).filter((t) => Date.now() - t < 15 * 60_000);
    if (hits.length >= 10) return res.status(429).send(authPage({ mode: "login", next: req.body.next, error: "Too many attempts. Try again later." }));
    attempts.set(key, [...hits, Date.now()]);
    const u = await db.one("SELECT * FROM users WHERE email = $1", [email]);
    if (!u || !verifyPassword(String(req.body.password ?? ""), u.password_hash)) {
      return res.status(401).send(authPage({ mode: "login", next: req.body.next, error: "Email or password is incorrect." }));
    }
    await startSession(res, u.id);
    res.redirect(safeNext(req.body.next));
  }));
  app.post("/register", wrap(async (req, res) => {
    const name = String(req.body.name ?? "").trim().slice(0, 80);
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
      return res.status(400).send(authPage({ mode: "register", next: req.body.next, error: "Enter a name, a valid email and a password of 8+ characters." }));
    }
    if (await db.one("SELECT 1 FROM users WHERE email = $1", [email])) {
      return res.status(409).send(authPage({ mode: "register", next: req.body.next, error: "That email already has an account." }));
    }
    const u = await db.one("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id", [email, name, hashPassword(password)]);
    await startSession(res, u.id);
    res.redirect(safeNext(req.body.next));
  }));
  app.post("/logout", wrap(async (req, res) => {
    const raw = /(?:^|;\s*)rsv=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    if (raw) await db.query("DELETE FROM sessions WHERE token_hash = $1", [sha(raw)]);
    res.clearCookie("rsv", { path: "/" }).redirect("/");
  }));

  app.use((_req, res) => res.status(404).send(homePage404()));
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof booking.BookingError) return res.status(err.status).send(`<p style="font-family:system-ui;padding:2rem">${err.message} <a href="/">Back</a></p>`);
    console.error(err);
    res.status(500).send(`<p style="font-family:system-ui;padding:2rem">Something went wrong. <a href="/">Back</a></p>`);
  });
  return app;
}

const homePage404 = () => `<!doctype html><title>Not found</title><p style="font-family:system-ui;padding:3rem">Page not found. <a href="/">Back to Reserva</a></p>`;
