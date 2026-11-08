# Reserva

A restaurant-booking demo built on **[OpenDoor](https://github.com/abhishekvardan/opendoor)**. People book tables on the website. AI assistants such as Claude, ChatGPT or your own agent can do the same through MCP, but only with the user's permission.

It's a plain server-rendered Express app with its own login. OpenDoor adds the agent layer in one config block ([src/app.js](src/app.js)) and supplies the consent screen and the "AI agents" dashboard at `/opendoor`.

## What agents can do

| Action | Permission |
|---|---|
| `restaurants.search`, `restaurants.get`, `menu.get`, `availability.check` | Find restaurants |
| `bookings.list`, `bookings.get` | See your bookings |
| `bookings.create`, `bookings.update` (need `confirm: true`) | Book tables for you (medium risk) |
| `bookings.cancel` (needs `confirm: true`) | Cancel your bookings (high risk, off by default) |
| `profile.get` | Know your name |

On top of those permissions, users can cap the **largest party** an agent may book. Every call, allowed or denied, shows up in the activity log at `/opendoor`.

## Run it

```bash
npm install
npm run dev     # http://localhost:4900 — demo@reserva.dev / demo1234
npm test        # end to end with the MCP SDK: OAuth, booking, limits, permissions, availability
```

Without `DATABASE_URL`, it uses embedded Postgres (PGlite). To connect an agent, add `http://localhost:4900/mcp` in Claude Code, or deploy the app and add `https://<your-domain>/mcp` as a custom connector in Claude or ChatGPT.

Restaurants, menus and bookings are fictional.
