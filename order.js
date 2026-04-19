require("dotenv").config();
const { chromium } = require("playwright");
const Anthropic = require("@anthropic-ai/sdk");
const { items } = require("./snacks.json");

const SAMEDAY_URL = "https://sameday.costco.com";
const ADDRESS = process.env.DELIVERY_ADDRESS;
const CDP_PORT = process.env.CDP_PORT || 9222;
const MODE = process.argv[2] || "list";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

async function connect() {
  console.log(`Connecting to Chrome on port ${CDP_PORT}...`);
  const browser = await chromium.connectOverCDP(`http://localhost:${CDP_PORT}`);
  const context = browser.contexts()[0];
  const page = await context.newPage();
  return { browser, page };
}

async function setDeliveryAddress(page) {
  if (!ADDRESS) return;
  console.log(`Setting delivery address: ${ADDRESS}`);

  const addressBtn = page.locator('[data-testid="address-selector"], [data-testid="delivery-address"], button:has-text("Delivery")').first();
  if (!(await addressBtn.isVisible({ timeout: 3000 }).catch(() => false))) return;

  await addressBtn.click();
  await page.waitForTimeout(1000);

  const addressInput = page.locator('input[placeholder*="address" i], input[aria-label*="address" i]').first();
  if (!(await addressInput.isVisible({ timeout: 3000 }).catch(() => false))) return;

  await addressInput.fill(ADDRESS);
  await page.waitForTimeout(1500);

  const suggestion = page.locator('[role="option"], li[class*="suggestion"]').first();
  if (await suggestion.isVisible({ timeout: 3000 }).catch(() => false)) {
    await suggestion.click();
    await page.waitForTimeout(1000);
  }

  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Confirm"), button:has-text("Done")').first();
  if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) await saveBtn.click();
  console.log("Address set.");
}

function shortenQuery(name) {
  // Use only the brand + product type (first 3-4 words), drop sizes/counts/commas
  const cleaned = name.split(",")[0].trim();
  const words = cleaned.split(/\s+/).slice(0, 6);
  return words.join(" ");
}

async function llmPickProduct(desiredItem, productNames) {
  if (!anthropic || productNames.length === 0) return -1;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-20250414",
      max_tokens: 20,
      messages: [{
        role: "user",
        content: `Which product best matches "${desiredItem}"? Reply with ONLY the number (0-indexed) or -1 if none match.\n\n${productNames.map((p, i) => `${i}. ${p}`).join("\n")}`
      }]
    });
    const idx = parseInt(msg.content[0].text.trim());
    return isNaN(idx) ? -1 : idx;
  } catch (e) {
    console.log(`  ⚠ LLM call failed: ${e.message}, falling back to keyword matching`);
    return -1;
  }
}

function keywordMatch(name, cardTexts) {
  const keywords = name.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
  let bestIndex = -1, bestScore = 0;
  for (let i = 0; i < cardTexts.length; i++) {
    const score = keywords.filter(kw => cardTexts[i].includes(kw)).length;
    if (score > bestScore) { bestScore = score; bestIndex = i; }
  }
  return bestScore >= Math.min(3, keywords.length) ? bestIndex : -1;
}

async function searchAndAdd(page, name, qty) {
  const query = shortenQuery(name);
  console.log(`Searching for: "${query}" (x${qty})`);

  const url = `${SAMEDAY_URL}/store/costco/s?k=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  if (!currentUrl.includes("?k=")) {
    console.log(`  ⚠ Redirected away from search, retrying...`);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(5000);
  }

  // Collect all cards with Add buttons and their text
  const allCards = page.locator('li');
  const cardCount = await allCards.count();
  const addableCards = [];
  for (let i = 0; i < cardCount; i++) {
    const hasAddBtn = await allCards.nth(i).locator('button', { hasText: /^Add$/ }).count() > 0;
    if (!hasAddBtn) continue;
    const cardText = (await allCards.nth(i).textContent()).toLowerCase();
    addableCards.push({ index: i, text: cardText });
  }

  if (addableCards.length === 0) {
    console.log(`  ✗ No products found for: ${name}`);
    return false;
  }

  // Use LLM to pick, fall back to keyword matching
  let pickIdx = await llmPickProduct(name, addableCards.map(c => c.text.slice(0, 100)));
  if (pickIdx >= 0 && pickIdx < addableCards.length) {
    console.log(`  🤖 LLM picked: ${addableCards[pickIdx].text.slice(0, 60)}`);
  } else {
    pickIdx = keywordMatch(name, addableCards.map(c => c.text));
    if (pickIdx >= 0) console.log(`  📝 Keyword matched: ${addableCards[pickIdx].text.slice(0, 60)}`);
  }

  if (pickIdx < 0) {
    console.log(`  ✗ Could not find matching product for: ${name}`);
    await page.screenshot({ path: `debug-search-${query.slice(0, 20).replace(/\s+/g, "-")}.png` });
    return false;
  }

  const cardIdx = addableCards[pickIdx].index;
  await allCards.nth(cardIdx).locator('button', { hasText: /^Add$/ }).click();
  await page.waitForTimeout(2000);
  for (let q = 1; q < qty; q++) {
    const plusBtn = allCards.nth(cardIdx).locator('button[aria-label*="Increment"]');
    if (await plusBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await plusBtn.click();
      await page.waitForTimeout(500);
    }
  }
  console.log(`  ✓ Added: ${name} x${qty}`);
  return true;
}

async function addItemsFromList(page) {
  console.log(`\nAdding ${items.length} items from snacks.json...\n`);
  let added = 0;
  for (const item of items) {
    const name = typeof item === "string" ? item : item.name;
    const qty = typeof item === "string" ? 1 : (item.qty || 1);
    if (await searchAndAdd(page, name, qty)) added++;
  }
  console.log(`\nAdded ${added}/${items.length} items.`);
}

async function reorderFromHistory(page) {
  console.log("\nNavigating to order history...");
  await page.goto(`${SAMEDAY_URL}/store/account/orders`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: "debug-orders-page.png", fullPage: true });
  console.log("Screenshot saved: debug-orders-page.png");

  const viewBtn = page.locator('a:has-text("View order"), button:has-text("View order")').first();
  if (await viewBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await viewBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: "debug-order-detail.png", fullPage: true });
    console.log("Screenshot saved: debug-order-detail.png");
  }

  const reorderBtn = page.locator('button:has-text("Reorder"), button:has-text("Add all to cart"), button:has-text("Add All"), a:has-text("Reorder")').first();
  if (await reorderBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await reorderBtn.click();
    await page.waitForTimeout(3000);
    console.log("✓ Reordered from last order.");
  } else {
    console.log("Reorder button not found. Check debug screenshots. Falling back to snacks.json.\n");
    await addItemsFromList(page);
  }
}

async function goToCheckout(page) {
  console.log("\nOpening cart...");
  await page.goto(`${SAMEDAY_URL}/store/costco/storefront?cart_open`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const checkoutBtn = page.locator('button:has-text("Go to Checkout"), button:has-text("Checkout"), a:has-text("Checkout")').first();
  if (await checkoutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await checkoutBtn.click();
    await page.waitForTimeout(3000);
  }

  const freeDelivery = page.locator('label:has-text("Free"), button:has-text("Free"), [data-testid*="delivery-option"]:has-text("Free")').first();
  if (await freeDelivery.isVisible({ timeout: 3000 }).catch(() => false)) {
    await freeDelivery.click();
    console.log("✓ Selected fastest free delivery.");
  }

  console.log("\n=== Cart is ready for review! ===");
  console.log("Review your order in Chrome and press 'Place Order' when ready.\n");
}

async function main() {
  if (!ADDRESS) {
    console.error("Set DELIVERY_ADDRESS in .env first. See .env.sample.");
    process.exit(1);
  }

  let conn;
  try {
    conn = await connect();
  } catch {
    console.error(
      "\nCould not connect to Chrome.\n\n" +
      "  1. Quit Chrome (Cmd+Q)\n" +
      "  2. Run: npm run start-chrome\n" +
      "  3. Log into Costco Same Day in Chrome\n" +
      "  4. Run: npm run reorder\n"
    );
    process.exit(1);
  }

  const { page } = conn;
  try {
    await page.goto(SAMEDAY_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    console.log(`Page title: ${await page.title()}`);

    await setDeliveryAddress(page);

    if (MODE === "reorder") {
      await reorderFromHistory(page);
    } else {
      await addItemsFromList(page);
    }

    await goToCheckout(page);
    console.log("Done! Review your cart in Chrome. Press Ctrl+C to exit.");
    await new Promise(() => {});
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

main();
