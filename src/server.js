import { initDb, db } from "./db.js";
import { seed, DEMO_USER } from "./seed.js";
import { createApp } from "./app.js";

await initDb();
await seed();
const port = Number(process.env.PORT) || 4900;
createApp().listen(port, () => {
  console.log(`
  Reserva       http://localhost:${port}
  database      ${db.kind}
  MCP endpoint  http://localhost:${port}/mcp
  AI agents     http://localhost:${port}/opendoor
  demo login    ${DEMO_USER.email} / ${DEMO_USER.password}
`);
});
