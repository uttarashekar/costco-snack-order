# Costco Same Day Snack Orderer

Automates adding snacks to your Costco Same Day cart using Playwright and your real Chrome browser. No bot detection — it connects to your running Chrome session via CDP.

## How It Works

1. You launch Chrome with remote debugging enabled (a one-line command)
2. Log into Costco Same Day in that Chrome window
3. Run the script — it opens a new tab, adds items to your cart, and stops at checkout for you to review

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
google-chrome --remote-debugging-port=9222 &
```

**Windows:**
```bash
start chrome --remote-debugging-port=9222
```

Chrome opens normally with all your tabs. Log into [sameday.costco.com](https://sameday.costco.com) if you haven't already.

> The Chrome profile is stored at `~/.costco-chrome-profile` (Mac). Your regular Chrome profile is unaffected.

### 2. Run the script

```bash
# Add items from snacks.json to cart
npm run order

# Reorder your last Costco Same Day order
npm run reorder
```

The script stops at checkout so you can review before placing the order.

## Customizing Your Snack List

Edit `snacks.json`:

```json
{
  "items": [
    "Kirkland Signature Mixed Nuts",
    "Goldfish Cheddar Crackers",
    "Skinny Pop Popcorn"
  ]
}
```

Items are searched by name on Costco Same Day and the first result is added.

## Config (.env)

| Variable | Description |
|---|---|
| `DELIVERY_ADDRESS` | Your delivery address as you'd type it on Costco Same Day |
| `CDP_PORT` | Chrome debug port (default: `9222`) |

## Notes

- Chrome must be launched with `--remote-debugging-port` for the script to connect
- Costco Same Day's UI may change over time — selectors in `order.js` may need updating
- The script saves debug screenshots (`debug-orders-page.png`, `debug-order-detail.png`) when the reorder flow can't find the expected buttons
- No credentials are stored — authentication is handled through your Chrome session

## License

MIT
