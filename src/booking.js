import crypto from "node:crypto";
import { db } from "./db.js";

/**
 * Reserva's booking logic. The website's forms and the AI agent actions both call these
 * functions, so agents follow exactly the same rules as people.
 */
export class BookingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SEATING_MINUTES = 90;
const SLOT_MINUTES = 30;
const MAX_DAYS_AHEAD = 60;
const toMin = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const today = () => new Date().toISOString().slice(0, 10);
export const priceLabel = (n) => "$".repeat(n);

export function formatDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
export function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || Number.isNaN(Date.parse(date))) throw new BookingError("INVALID_DATE", "Use a date like 2026-11-20.");
  const t = today();
  const max = new Date(Date.now() + MAX_DAYS_AHEAD * 86400_000).toISOString().slice(0, 10);
  if (date < t) throw new BookingError("DATE_IN_PAST", "That date has already passed.");
  if (date > max) throw new BookingError("DATE_TOO_FAR", `Bookings open up to ${MAX_DAYS_AHEAD} days ahead.`);
}
function checkParty(n) {
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new BookingError("INVALID_PARTY", "Party size must be between 1 and 12.");
}

const toRestaurant = (r) => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  cuisine: r.cuisine,
  neighborhood: r.neighborhood,
  price: priceLabel(r.price_level),
  price_level: r.price_level,
  rating: Math.round(r.rating * 10) / 10,
  review_count: r.review_count,
  description: r.description,
  emoji: r.emoji,
  hue: r.hue,
  hours: `${formatTime(r.opens)} – ${formatTime(r.closes)}`,
  opens: r.opens,
  closes: r.closes,
  largest_table: Math.max(...Object.keys(r.tables).map(Number)),
});

export async function getRestaurant(ref) {
  const key = String(ref ?? "").trim();
  const r = await db.one(`SELECT * FROM restaurants WHERE ${/^[0-9a-f-]{36}$/i.test(key) ? "id" : "slug"} = $1`, [key]);
  if (!r) throw new BookingError("RESTAURANT_NOT_FOUND", `No restaurant "${key}". Use restaurants.search to find one.`, 404);
  return { ...toRestaurant(r), _row: r };
}

export async function cuisines() {
  return (await db.many("SELECT DISTINCT cuisine FROM restaurants ORDER BY cuisine")).map((r) => r.cuisine);
}

/** Free times for one restaurant, date and party size. Each booking holds one table for 90 minutes. */
export async function availability(ref, date, partySize, { excludeBookingId = null, q = db } = {}) {
  checkDate(date);
  checkParty(partySize);
  const r = ref._row ? ref : await getRestaurant(ref);
  const tables = r._row.tables;
  const sizes = Object.keys(tables).map(Number).filter((s) => s >= partySize).sort((a, b) => a - b);
  if (!sizes.length) return { restaurant: r.slug, date, party_size: partySize, times: [], note: `Largest table seats ${r.largest_table}.` };
  const booked = (await q.query(
    `SELECT minutes, table_size FROM bookings WHERE restaurant_id = $1 AND date = $2 AND status = 'confirmed' AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [r.id, date, excludeBookingId],
  )).rows;
  const nowMin = date === today() ? new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 30 : -1;
  const times = [];
  for (let t = toMin(r.opens); t <= toMin(r.closes) - SEATING_MINUTES; t += SLOT_MINUTES) {
    if (t <= nowMin) continue;
    const size = sizes.find((s) => booked.filter((b) => b.table_size === s && Math.abs(b.minutes - t) < SEATING_MINUTES).length < tables[s]);
    if (size) times.push({ time: toHHMM(t), label: formatTime(toHHMM(t)), table_for: size });
  }
  return { restaurant: r.slug, restaurant_name: r.name, date, date_label: formatDate(date), party_size: partySize, times };
}

export async function searchRestaurants({ query, cuisine, neighborhood, max_price_level, date, time, party_size } = {}) {
  const where = [];
  const params = [];
  const add = (v) => (params.push(v), `$${params.length}`);
  for (const term of String(query ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const p = add(`%${term.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(name ILIKE ${p} OR cuisine ILIKE ${p} OR neighborhood ILIKE ${p} OR description ILIKE ${p})`);
  }
  if (cuisine) where.push(`lower(cuisine) = lower(${add(cuisine)})`);
  if (neighborhood) where.push(`lower(neighborhood) = lower(${add(neighborhood)})`);
  if (max_price_level) where.push(`price_level <= ${add(max_price_level)}`);
  const rows = await db.many(`SELECT * FROM restaurants ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY rating DESC, name`, params);
  const list = rows.map((r) => ({ ...toRestaurant(r), _row: r }));
  if (date && party_size) {
    for (const r of list) {
      const a = await availability(r, date, party_size);
      r.available_times = time
        ? a.times.filter((x) => Math.abs(toMin(x.time) - toMin(time)) <= 60).map((x) => x.time)
        : a.times.map((x) => x.time);
    }
  }
  return list.map(({ _row, ...r }) => r);
}

export async function menu(ref, { dietary } = {}) {
  const r = await getRestaurant(ref);
  let items = await db.many("SELECT category, name, description, price_cents, tags FROM menu_items WHERE restaurant_id = $1 ORDER BY position", [r.id]);
  if (dietary) items = items.filter((i) => i.tags.includes(dietary.toLowerCase()));
  return { restaurant: r.slug, restaurant_name: r.name, items: items.map((i) => ({ ...i, price: `$${(i.price_cents / 100).toFixed(0)}` })) };
}

const toBooking = (b) => ({
  id: b.id,
  code: b.code,
  status: b.status,
  restaurant: { slug: b.slug, name: b.name, emoji: b.emoji, neighborhood: b.neighborhood, hue: b.hue },
  date: b.date_text,
  time: b.time,
  when: `${formatDate(b.date_text)}, ${formatTime(b.time)}`,
  party_size: b.party_size,
  special_requests: b.special_requests,
  placed_by: b.placed_by,
  agent_name: b.agent_name,
});
const BOOKING_SELECT = `SELECT b.*, b.date::text AS date_text, r.slug, r.name, r.emoji, r.neighborhood, r.hue FROM bookings b JOIN restaurants r ON r.id = b.restaurant_id`;

/** Books atomically: the restaurant row is locked so two requests can't take the last table. */
export async function createBooking(userId, { restaurant, date, time, party_size, special_requests }, { placedBy = "guest", agentName = null } = {}) {
  const r = await getRestaurant(restaurant);
  const id = await db.tx(async (t) => {
    await t.query("SELECT id FROM restaurants WHERE id = $1 FOR UPDATE", [r.id]);
    const a = await availability(r, date, party_size, { q: t });
    const slot = a.times.find((x) => x.time === time);
    if (!slot) {
      throw new BookingError("NOT_AVAILABLE",
        `No table for ${party_size} at ${r.name} on ${formatDate(date)} at ${time}. Available: ${a.times.slice(0, 8).map((x) => x.time).join(", ") || "none that day"}.`, 409);
    }
    const code = `RSV-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const row = (await t.query(
      `INSERT INTO bookings (code, user_id, restaurant_id, date, time, minutes, party_size, table_size, special_requests, placed_by, agent_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [code, userId, r.id, date, time, toMin(time), party_size, slot.table_for, special_requests || null, placedBy, agentName],
    )).rows[0];
    return row.id;
  });
  return getBooking(userId, id);
}

export async function listBookings(userId, { upcoming = true } = {}) {
  const rows = await db.many(
    `${BOOKING_SELECT} WHERE b.user_id = $1 ${upcoming ? "AND b.date >= $2::date" : "AND $2::text IS NOT NULL"} ORDER BY b.date, b.minutes`,
    [userId, today()],
  );
  return rows.map(toBooking);
}

export async function getBooking(userId, ref) {
  const key = String(ref ?? "").trim();
  const b = await db.one(`${BOOKING_SELECT} WHERE b.user_id = $1 AND ${/^[0-9a-f-]{36}$/i.test(key) ? "b.id = $2" : "upper(b.code) = upper($2)"}`, [userId, key]);
  if (!b) throw new BookingError("BOOKING_NOT_FOUND", `No booking "${key}" on this account.`, 404);
  return toBooking(b);
}

export async function updateBooking(userId, ref, changes) {
  const current = await getBooking(userId, ref);
  if (current.status !== "confirmed") throw new BookingError("BOOKING_CANCELLED", "This booking was cancelled.", 409);
  const next = {
    date: changes.date ?? current.date,
    time: changes.time ?? current.time,
    party_size: changes.party_size ?? current.party_size,
    special_requests: changes.special_requests ?? current.special_requests,
  };
  const r = await getRestaurant(current.restaurant.slug);
  await db.tx(async (t) => {
    await t.query("SELECT id FROM restaurants WHERE id = $1 FOR UPDATE", [r.id]);
    const a = await availability(r, next.date, next.party_size, { excludeBookingId: current.id, q: t });
    const slot = a.times.find((x) => x.time === next.time);
    if (!slot) throw new BookingError("NOT_AVAILABLE", `No table for ${next.party_size} at ${next.time} on ${formatDate(next.date)}. Available: ${a.times.slice(0, 8).map((x) => x.time).join(", ") || "none"}.`, 409);
    await t.query(
      "UPDATE bookings SET date = $2, time = $3, minutes = $4, party_size = $5, table_size = $6, special_requests = $7, updated_at = now() WHERE id = $1",
      [current.id, next.date, next.time, toMin(next.time), next.party_size, slot.table_for, next.special_requests || null],
    );
  });
  return getBooking(userId, current.id);
}

export async function cancelBooking(userId, ref) {
  const b = await getBooking(userId, ref);
  if (b.status === "cancelled") return b;
  await db.query("UPDATE bookings SET status = 'cancelled', updated_at = now() WHERE id = $1 AND user_id = $2", [b.id, userId]);
  return getBooking(userId, b.id);
}
