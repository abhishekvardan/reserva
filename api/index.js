// Vercel serverless entry: the whole server-rendered app (pages, MCP, OAuth, OpenDoor dashboard) is one function.
import { initDb } from "../src/db.js";
import { seed } from "../src/seed.js";
import { createApp } from "../src/app.js";

let ready = null;
const app = createApp();

export default async function handler(req, res) {
  ready ??= initDb().then(seed).catch((err) => {
    ready = null;
    throw err;
  });
  await ready;
  return app(req, res);
}
