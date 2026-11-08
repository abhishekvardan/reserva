import crypto from "node:crypto";
import { db } from "./db.js";

export const DEMO_USER = { email: "demo@reserva.dev", password: "demo1234", name: "Demo Diner" };

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${crypto.scryptSync(pw, salt, 64).toString("base64url")}`;
}
export function verifyPassword(pw, stored) {
  const [, s, h] = String(stored).split("$");
  if (!s || !h) return false;
  const expected = Buffer.from(h, "base64url");
  const actual = crypto.scryptSync(pw, Buffer.from(s, "base64url"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const R = (slug, name, cuisine, neighborhood, price, rating, reviews, emoji, hue, opens, closes, tables, description, menu) =>
  ({ slug, name, cuisine, neighborhood, price, rating, reviews, emoji, hue, opens, closes, tables, description, menu });
const M = (category, name, price, description, tags = []) => ({ category, name, price, description, tags });

export const RESTAURANTS = [
  R("trattoria-sole", "Trattoria Sole", "Italian", "Riverside", 2, 4.7, 1284, "🍝", 18, "12:00", "22:30", { 2: 6, 4: 5, 6: 2 },
    "Hand-rolled pasta, wood-fired pizza and a sunny terrace by the river. Family recipes from Puglia.",
    [M("Starters", "Burrata & heirloom tomatoes", 14, "Basil oil, sea salt, grilled sourdough.", ["vegetarian"]),
      M("Starters", "Fried artichokes", 12, "Lemon aioli.", ["vegetarian"]),
      M("Pasta", "Cacio e pepe", 19, "Tonnarelli, pecorino romano, black pepper.", ["vegetarian"]),
      M("Pasta", "Orecchiette with sausage", 22, "Broccoli rabe, chili, garlic."),
      M("Pizza", "Margherita", 17, "San Marzano tomato, fior di latte, basil.", ["vegetarian"]),
      M("Dessert", "Tiramisu", 10, "Mascarpone, espresso, cocoa.", ["vegetarian"])]),
  R("kumo-sushi", "Kumo Sushi", "Japanese", "Old Town", 3, 4.8, 962, "🍣", 200, "17:00", "23:00", { 2: 8, 4: 3 },
    "Omakase counter and quiet booths. Fish flown in daily, rice seasoned the Edomae way.",
    [M("Omakase", "Chef's omakase (12 pieces)", 95, "Seasonal nigiri chosen by the chef."),
      M("Rolls", "Spicy tuna roll", 16, "Cucumber, sesame, chili mayo."),
      M("Rolls", "Avocado & cucumber roll", 11, "Shiso, sesame.", ["vegan"]),
      M("Small plates", "Agedashi tofu", 12, "Dashi broth, bonito, scallion.", ["vegetarian"]),
      M("Dessert", "Matcha ice cream", 8, "Uji matcha.", ["vegetarian"])]),
  R("saffron-house", "Saffron House", "Indian", "Market District", 2, 4.6, 1530, "🍛", 35, "11:30", "22:00", { 2: 5, 4: 6, 6: 3, 8: 1 },
    "Slow-cooked curries, tandoor breads and generous thalis. Big tables for big groups.",
    [M("Starters", "Samosa chaat", 9, "Chickpeas, tamarind, yogurt, mint.", ["vegetarian"]),
      M("Mains", "Butter chicken", 21, "Tandoori chicken in tomato and cream."),
      M("Mains", "Chana masala", 16, "Chickpeas, ginger, garam masala.", ["vegan", "gluten-free"]),
      M("Mains", "Lamb rogan josh", 24, "Kashmiri chili, cardamom."),
      M("Breads", "Garlic naan", 5, "From the tandoor.", ["vegetarian"]),
      M("Dessert", "Gulab jamun", 7, "Rose syrup.", ["vegetarian"])]),
  R("casa-verde", "Casa Verde", "Mexican", "Riverside", 1, 4.5, 2210, "🌮", 140, "11:00", "23:00", { 2: 6, 4: 6, 6: 2 },
    "Tacos al pastor off the trompo, fresh tortillas and a mezcal list worth the trip.",
    [M("Tacos", "Al pastor (3)", 12, "Pineapple, onion, cilantro."),
      M("Tacos", "Mushroom & poblano (3)", 11, "Salsa verde, queso fresco.", ["vegetarian"]),
      M("Plates", "Enchiladas verdes", 17, "Chicken, tomatillo, crema."),
      M("Sides", "Elote", 6, "Grilled corn, cotija, chili.", ["vegetarian", "gluten-free"]),
      M("Dessert", "Churros", 8, "Cinnamon sugar, chocolate.", ["vegetarian"])]),
  R("le-petit-four", "Le Petit Four", "French", "Old Town", 4, 4.9, 640, "🥐", 330, "18:00", "23:00", { 2: 7, 4: 2 },
    "A candlelit bistro for long dinners: classic French cooking and a deep wine cellar.",
    [M("Entrées", "French onion soup", 15, "Gruyère crouton.", ["vegetarian"]),
      M("Plats", "Duck confit", 38, "Lentils, mustard jus."),
      M("Plats", "Steak frites", 42, "Béarnaise, hand-cut fries.", ["gluten-free"]),
      M("Desserts", "Crème brûlée", 13, "Tahitian vanilla.", ["vegetarian", "gluten-free"])]),
  R("seoul-kitchen", "Seoul Kitchen", "Korean", "Market District", 2, 4.6, 875, "🍲", 0, "12:00", "22:00", { 2: 4, 4: 6, 6: 2 },
    "Tabletop barbecue, bubbling stews and banchan that keeps coming.",
    [M("Barbecue", "Galbi (beef short rib)", 32, "Marinated, grilled at your table.", ["gluten-free"]),
      M("Stews", "Kimchi jjigae", 17, "Pork, tofu, aged kimchi."),
      M("Stews", "Soft tofu stew", 16, "Vegetable broth, egg.", ["vegetarian"]),
      M("Rice", "Bibimbap", 18, "Stone bowl, gochujang.", ["vegetarian"])]),
  R("green-table", "Green Table", "Vegetarian", "Harbor", 2, 4.7, 512, "🥗", 110, "09:00", "21:30", { 2: 6, 4: 4 },
    "Seasonal, plant-forward cooking with produce from farms within 50 miles.",
    [M("Bowls", "Harvest grain bowl", 16, "Farro, roasted squash, tahini.", ["vegan"]),
      M("Plates", "Mushroom bourguignon", 21, "Pearl onions, mash.", ["vegan", "gluten-free"]),
      M("Plates", "Ricotta gnocchi", 19, "Brown butter, sage.", ["vegetarian"]),
      M("Dessert", "Olive oil cake", 9, "Citrus, mascarpone.", ["vegetarian"])]),
  R("harbor-fish", "Harbor Fish Co.", "Seafood", "Harbor", 3, 4.4, 1105, "🦞", 190, "12:00", "22:00", { 2: 5, 4: 5, 6: 2, 8: 1 },
    "Oysters on ice, lobster rolls and the day's catch, grilled simply over charcoal.",
    [M("Raw bar", "Half-dozen oysters", 21, "Mignonette, lemon.", ["gluten-free"]),
      M("Mains", "Lobster roll", 34, "Brown butter, chives, fries."),
      M("Mains", "Catch of the day", 36, "Charcoal grilled, salsa verde.", ["gluten-free"]),
      M("Dessert", "Key lime pie", 10, "Graham crust.", ["vegetarian"])]),
];

export async function seed() {
  const { n } = await db.one("SELECT count(*)::int AS n FROM restaurants");
  if (n === 0) {
    for (const r of RESTAURANTS) {
      const row = await db.one(
        `INSERT INTO restaurants (slug, name, cuisine, neighborhood, price_level, rating, review_count, description, emoji, hue, opens, closes, tables)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING id`,
        [r.slug, r.name, r.cuisine, r.neighborhood, r.price, r.rating, r.reviews, r.description, r.emoji, r.hue, r.opens, r.closes, JSON.stringify(r.tables)],
      );
      for (const [i, m] of r.menu.entries()) {
        await db.query(
          "INSERT INTO menu_items (restaurant_id, category, name, description, price_cents, tags, position) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)",
          [row.id, m.category, m.name, m.description, m.price * 100, JSON.stringify(m.tags), i],
        );
      }
    }
  }
  if (!(await db.one("SELECT 1 FROM users WHERE email = $1", [DEMO_USER.email]))) {
    await db.query("INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3)", [DEMO_USER.email, DEMO_USER.name, hashPassword(DEMO_USER.password)]);
  }
}
