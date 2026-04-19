# Costco Same Day Snack Orderer

Automates adding snacks to your Costco Same Day cart using Playwright and your real Chrome browser. Uses a lightweight AI agent layer (Claude Haiku) to intelligently pick the right products from search results — no brittle exact-match logic.

## How It Works

1. Launch Chrome with remote debugging enabled (uses a separate profile so your main Chrome is unaffected)
2. Log into Costco Same Day once in that Chrome window (session persists)
3. Run the script — it opens a new tab, searches for each item, uses an LLM to identify the best matching product from results, adds them to your cart with the right quantities, and stops at checkout for you to review

The **agentic** part: instead of relying on fragile keyword matching or exact product names, the script sends search results to Claude Haiku and asks it to reason about which product best matches your intent. This handles abbreviations, name variations, similar products, and ambiguous results that would trip up a purely rule-based approach.

Two modes:
- **`list`** — adds items from `snacks.json`
- **`reorder`** — reorders from your most recent Costco Same Day order

## Setup

```bash
npm install
npx playwright install chromium
cp .env.sample .env
# Edit .env with your delivery address
```

## Usage

### 1. Launch Chrome with debugging

Quit Chrome if it's running, then:

**Mac:**
```bash
npm run start-chrome
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.costco-chrome-profile" --no-first-run &
```

**Windows:**
```bash
start chrome --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\.costco-chrome-profile" --no-first-run
```

A separate Chrome window opens. Log into [sameday.costco.com](https://sameday.costco.com) — your session is saved in `~/.costco-chrome-profile` for future runs.

### 2. Run the script

```bash
# Add items from snacks.json to cart
npm run order

# Reorder your last Costco Same Day order
npm run reorder
```

The script stops at checkout so you can review before placing the order.

## Customizing Your Snack List

Edit `snacks.json`. Each item has a name (searched on Costco Same Day) and quantity:

```json
{
  "items": [
    { "name": "Skinny Pop Organic Popcorn, 14 oz", "qty": 2 },
    { "name": "RXBAR Protein Bars, Variety Pack, 14-count", "qty": 1 }
  ]
}
```

## Config (.env)

| Variable | Description |
|---|---|
| `DELIVERY_ADDRESS` | Your delivery address as you'd type it on Costco Same Day |
| `CDP_PORT` | Chrome debug port (default: `9222`) |
| `ANTHROPIC_API_KEY` | Anthropic API key for smart product matching (optional) |

## Product Matching

When searching for items, the script needs to pick the right product from search results. Two modes:

- **LLM matching** (if `ANTHROPIC_API_KEY` is set) — sends product names to Claude Haiku to pick the best match. Handles ambiguous names, abbreviations, and similar products well.
- **Keyword matching** (fallback) — scores products by keyword overlap with the item name. Works for exact or near-exact names.

## Notes

- **First time only:** you need to quit your regular Chrome before running `npm run start-chrome`. After that, the debugging Chrome stays open and you can reopen your regular Chrome separately.
- Your Costco login session persists in `~/.costco-chrome-profile` — you only log in once.
- No credentials are stored — authentication is handled through your Chrome session.
- Costco Same Day's UI may change over time — selectors in `order.js` may need updating.
- The script saves debug screenshots when the reorder flow can't find expected buttons.

## License

MIT
