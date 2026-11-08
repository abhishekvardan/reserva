import { formatDate, formatTime, priceLabel, today } from "./booking.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
:root{--ink:#111;--muted:#6b7280;--line:#e5e7eb;--soft:#f6f6f4;--accent:#c2410c;--accent-soft:#fff3ec;--ok:#15803d}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}.wrap{max-width:1160px;margin:0 auto;padding:0 24px}
header{border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);z-index:5}
header .wrap{display:flex;align-items:center;gap:22px;height:66px}.logo{font-weight:800;font-size:21px;letter-spacing:-.03em;display:flex;align-items:center;gap:9px}
.logo i{width:28px;height:28px;border-radius:8px;background:var(--ink);color:#fff;display:grid;place-items:center;font-style:normal;font-size:14px}
nav{display:flex;gap:4px;margin-left:12px}nav a{padding:7px 13px;border-radius:999px;color:var(--muted);font-size:15px}nav a:hover,nav a.on{color:var(--ink);background:var(--soft)}
.right{margin-left:auto;display:flex;gap:10px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:10px 20px;font:inherit;font-weight:600;font-size:15px;border:1px solid var(--ink);background:var(--ink);color:#fff;cursor:pointer}
.btn.light{background:#fff;color:var(--ink);border-color:var(--line)}.btn.light:hover{border-color:#9ca3af}.btn.sm{padding:6px 14px;font-size:14px}.btn.danger{background:#fff;color:#b91c1c;border-color:#fecaca}
.hero{padding:72px 0 40px}.hero h1{font-size:64px;line-height:1.02;letter-spacing:-.045em;margin:0;max-width:880px}.hero h1 span{color:var(--accent)}
.hero p{font-size:20px;color:var(--muted);max-width:620px;margin:18px 0 0}
.search{margin-top:34px;display:grid;grid-template-columns:2fr 1.2fr 1fr .8fr auto;gap:10px;padding:10px;border:1px solid var(--line);border-radius:22px;box-shadow:0 12px 40px rgba(0,0,0,.06)}
input,select,textarea{font:inherit;font-size:15px;border:1px solid var(--line);border-radius:12px;padding:11px 13px;background:#fff;width:100%;color:var(--ink)}input:focus,select:focus,textarea:focus{outline:2px solid var(--ink);outline-offset:-1px}
.search input,.search select{border:0;background:var(--soft)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:26px;margin:34px 0 70px}
.tile{border-radius:20px;aspect-ratio:4/3;display:grid;place-items:center;font-size:72px;position:relative;overflow:hidden}
.card h3{margin:14px 0 2px;font-size:18px;letter-spacing:-.01em}.meta{color:var(--muted);font-size:14px}
.times{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.time{border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:13px;font-weight:600}
.agentbox{border:1px solid var(--line);border-radius:22px;padding:26px 30px;display:flex;gap:26px;align-items:center;margin:10px 0 0;background:var(--soft)}
.agentbox code{background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:14px}
.cols{display:grid;grid-template-columns:1.25fr 1fr;gap:48px;margin:36px 0 80px}h1.title{font-size:44px;letter-spacing:-.035em;margin:18px 0 6px;line-height:1.05}
.panel{border:1px solid var(--line);border-radius:22px;padding:24px;position:sticky;top:90px}.panel h2{margin:0 0 14px;font-size:20px}
.slots{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}.slots button{border:1px solid var(--line);background:#fff;border-radius:12px;padding:10px 0;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.slots button:hover{border-color:var(--ink)}.menu h3{margin:28px 0 8px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.item{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line)}.item b{font-weight:600}.item small{display:block;color:var(--muted)}
.tag{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ok);margin-left:6px}
.list{display:grid;gap:12px;margin:24px 0 80px}.row{display:flex;gap:18px;align-items:center;border:1px solid var(--line);border-radius:18px;padding:14px 18px}
.row .tile{width:64px;aspect-ratio:1;border-radius:14px;font-size:30px;flex:none}.pill{display:inline-flex;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;border:1px solid var(--line);color:var(--muted)}
.pill.agent{color:#1d4ed8;border-color:#bfdbfe;background:#eff6ff}.pill.cancelled{color:#b91c1c;border-color:#fecaca}
.form{max-width:400px;margin:70px auto}.form h1{font-size:34px;letter-spacing:-.03em;margin:0 0 20px}.form label{display:block;font-size:14px;font-weight:600;margin:14px 0 6px}
.note{border-radius:12px;padding:11px 14px;font-size:14px}.note.ok{background:#f0fdf4;color:var(--ok);border:1px solid #bbf7d0}.note.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
footer{border-top:1px solid var(--line);padding:34px 0 50px;color:var(--muted);font-size:14px}
@media (max-width:860px){.search,.cols{grid-template-columns:1fr}.hero h1{font-size:42px}nav{display:none}.agentbox{flex-direction:column;align-items:flex-start}}
`;

export const tile = (r, cls = "tile") =>
  `<div class="${cls}" style="background:linear-gradient(135deg,hsl(${r.hue} 70% 95%),hsl(${r.hue} 55% 85%))">${esc(r.emoji)}</div>`;

export function layout({ title, user, body, active = "", base = "" }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Reserva</title><meta name="description" content="Book restaurant tables yourself, or let your AI assistant do it.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="alternate" type="text/plain" href="/llms.txt" title="For AI agents"><style>${CSS}</style></head><body>
<header><div class="wrap"><a class="logo" href="/"><i>R</i>Reserva</a>
<nav><a href="/" class="${active === "home" ? "on" : ""}">Restaurants</a><a href="/bookings" class="${active === "bookings" ? "on" : ""}">My bookings</a><a href="/opendoor">AI agents</a></nav>
<div class="right">${user ? `<span class="meta">${esc(user.name)}</span><form method="post" action="/logout"><button class="btn light sm">Sign out</button></form>` : `<a class="btn sm" href="/login">Sign in</a>`}</div></div></header>
<main class="wrap">${body}</main>
<footer><div class="wrap">Reserva is a demo of <a href="https://github.com/abhishekvardan/opendoor"><b>OpenDoor</b></a>: AI assistants can book here with your permission, through <code>${esc(base)}/mcp</code>. Restaurants and bookings are fictional.</div></footer>
</body></html>`;
}

export function homePage({ user, restaurants, cuisines, q, base }) {
  const d = q.date || today();
  const party = Number(q.party) || 2;
  return layout({
    title: "Book a table",
    user,
    active: "home",
    base,
    body: `<section class="hero"><h1>Book a table yourself. <span>Or let your AI do it.</span></h1>
<p>Find a restaurant, pick a time, done. Or connect Claude or ChatGPT and say “book a table for 4 on Friday at 8”.</p>
<form class="search" method="get" action="/">
<input name="q" placeholder="Restaurant, cuisine or area" value="${esc(q.q ?? "")}">
<select name="cuisine"><option value="">Any cuisine</option>${cuisines.map((c) => `<option ${q.cuisine === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
<input type="date" name="date" min="${today()}" value="${esc(d)}">
<select name="party">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}" ${n === party ? "selected" : ""}>${n} ${n === 1 ? "guest" : "guests"}</option>`).join("")}</select>
<button class="btn">Find a table</button></form>
<div class="agentbox"><div style="font-size:34px">🤖</div><div style="flex:1"><b>Let your AI assistant book for you</b><div class="meta">Add this URL as a custom connector in Claude or ChatGPT, then approve what it may do. You can revoke it any time.</div></div><code>${esc(base)}/mcp</code><a class="btn light sm" href="/opendoor">Manage agents</a></div></section>
<p class="meta">${restaurants.length} restaurants · availability for ${party} on ${esc(formatDate(d))}</p>
<section class="grid">${restaurants.map((r) => `<a class="card" href="/r/${esc(r.slug)}?date=${esc(d)}&party=${party}">${tile(r)}
<h3>${esc(r.name)}</h3><div class="meta">${esc(r.cuisine)} · ${esc(r.neighborhood)} · ${priceLabel(r.price_level)} · ★ ${r.rating}</div>
<div class="times">${(r.available_times ?? []).slice(0, 4).map((t) => `<span class="time">${esc(formatTime(t).replace(":00", ""))}</span>`).join("") || `<span class="meta">Fully booked</span>`}</div></a>`).join("")}</section>`,
  });
}

export function restaurantPage({ user, r, avail, menu, msg, base }) {
  const byCat = {};
  for (const i of menu.items) (byCat[i.category] ??= []).push(i);
  return layout({
    title: r.name,
    user,
    base,
    active: "home",
    body: `<div class="cols"><div>${tile(r)}<h1 class="title">${esc(r.name)}</h1>
<div class="meta">${esc(r.cuisine)} · ${esc(r.neighborhood)} · ${esc(r.price)} · ★ ${r.rating} (${r.review_count.toLocaleString()}) · ${esc(r.hours)}</div>
<p style="font-size:18px">${esc(r.description)}</p><div class="menu">${Object.entries(byCat).map(([c, items]) => `<h3>${esc(c)}</h3>${items.map((i) =>
      `<div class="item"><div><b>${esc(i.name)}</b>${i.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}<small>${esc(i.description)}</small></div><b>${esc(i.price)}</b></div>`).join("")}`).join("")}</div></div>
<aside><div class="panel"><h2>Reserve a table</h2>${msg ? `<p class="note err">${esc(msg)}</p>` : ""}
<form method="get" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input type="date" name="date" min="${today()}" value="${esc(avail.date)}">
<select name="party" onchange="this.form.submit()">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<option value="${n}" ${n === avail.party_size ? "selected" : ""}>${n} ${n === 1 ? "guest" : "guests"}</option>`).join("")}</select>
<button class="btn light sm" style="grid-column:span 2">Show times</button></form>
<div class="meta" style="margin-top:14px">${esc(avail.date_label)} · ${avail.party_size} ${avail.party_size === 1 ? "guest" : "guests"}</div>
${avail.times.length ? `<form method="post" action="/r/${esc(r.slug)}/book"><input type="hidden" name="date" value="${esc(avail.date)}"><input type="hidden" name="party" value="${avail.party_size}">
<textarea name="requests" rows="2" placeholder="Special requests (optional)" style="margin-top:12px"></textarea>
<div class="slots">${avail.times.map((t) => `<button name="time" value="${esc(t.time)}">${esc(t.label.replace(":00", ""))}</button>`).join("")}</div></form>` : `<p class="meta">${esc(avail.note ?? "No tables left that day. Try another date.")}</p>`}
${user ? "" : `<p class="meta" style="margin-top:14px">You'll be asked to sign in to confirm.</p>`}</div></aside></div>`,
  });
}

export function bookingsPage({ user, bookings, flash, base }) {
  return layout({
    title: "My bookings",
    user,
    base,
    active: "bookings",
    body: `<h1 class="title" style="margin-top:44px">My bookings</h1><p class="meta">Bookings you made, and bookings your AI agents made for you.</p>
${flash ? `<p class="note ok">${esc(flash)}</p>` : ""}<div class="list">${bookings.length ? bookings.map((b) => `<div class="row">${tile(b.restaurant, "tile")}
<div style="flex:1"><b>${esc(b.restaurant.name)}</b> <span class="pill ${b.status === "cancelled" ? "cancelled" : ""}">${esc(b.status)}</span> ${b.placed_by === "agent" ? `<span class="pill agent">🤖 via ${esc(b.agent_name)}</span>` : ""}
<div class="meta">${esc(b.when)} · ${b.party_size} ${b.party_size === 1 ? "guest" : "guests"} · ${esc(b.code)}${b.special_requests ? ` · “${esc(b.special_requests)}”` : ""}</div></div>
${b.status === "confirmed" ? `<form method="post" action="/bookings/${esc(b.code)}/cancel"><button class="btn danger sm">Cancel</button></form>` : ""}</div>`).join("") : `<p class="meta">No upcoming bookings. <a href="/"><b>Find a table →</b></a></p>`}</div>`,
  });
}

export function authPage({ mode, next, error, base = "" }) {
  const login = mode === "login";
  return layout({
    title: login ? "Sign in" : "Create account",
    user: null,
    base,
    body: `<form class="form" method="post" action="/${login ? "login" : "register"}"><h1>${login ? "Sign in" : "Create your account"}</h1>
${error ? `<p class="note err">${esc(error)}</p>` : ""}<input type="hidden" name="next" value="${esc(next ?? "/")}">
${login ? "" : `<label>Name</label><input name="name" required maxlength="80">`}
<label>Email</label><input name="email" type="email" required value="${login ? "demo@reserva.dev" : ""}">
<label>Password</label><input name="password" type="password" required minlength="${login ? 1 : 8}" ${login ? 'value="demo1234"' : ""}>
<button class="btn" style="width:100%;margin-top:20px">${login ? "Sign in" : "Create account"}</button>
<p class="meta" style="text-align:center">${login ? `Demo account prefilled · <a href="/register?next=${encodeURIComponent(next ?? "/")}"><b>Create an account</b></a>` : `<a href="/login?next=${encodeURIComponent(next ?? "/")}"><b>Sign in instead</b></a>`}</p></form>`,
  });
}
