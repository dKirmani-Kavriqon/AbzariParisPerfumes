# Shopping bag (cart)

Phase 3B. Anonymous shoppers can add items, change quantities, remove items and clear the bag.
The bag survives refreshes and navigation. Checkout submission, payment, orders and stock
reservation are later phases.

## How it works

```
browser (localStorage)                         Worker                              Neon
{ store, items: [{ sku, quantity }],   POST /api/cart/quote  ──▶  validate (strict)  ──▶  one SQL statement:
  updatedAt, seen }                    { items: [{sku,qty}] }       store from config        store + variants + products
        ▲                                                         price in integer paise   + stock + primary image
        └──────────── lines, prices, status, subtotal, canCheckout ◀──────────────────────────────┘
```

- **The browser holds the shopper's choices only**: SKUs and quantities. Every price, total and
  availability shown comes from the server's quote.
- **The quote is fetched** when the bag loads (page load with items), after every change
  (quantity changes are batched for 300 ms, so rapid clicks send one request), when the bag is
  opened with an answer older than a minute, and when checkout opens.
- **The server never trusts the browser**: the store is this deployment's (never a request
  field), prices and stock are read from the database at that moment, and the request schema
  is strict, so a body carrying a price, total or store id is refused (422).

Code: rules shared by browser and server in `src/commerce/cart/cart.ts`, pricing in
`src/commerce/cart/quote.ts`, the route in `src/server/api/routes.ts`, the browser store in
`src/state/cart.ts` (`src/state/cart-view.ts` for the screens), UI in
`src/components/CartDrawer.tsx`, `AddToBagButton.tsx`, `src/views/ProductPage.tsx`,
`src/views/Checkout.tsx`.

## Persistence

| | |
| --- | --- |
| Where | `localStorage`, key `kce-cart:<store code>` |
| What | `{ v: 2, store, items: [{ sku, quantity }], updatedAt, seen }` |
| Expiry | 30 days after the last change; an expired, unreadable or other-store copy is discarded |
| Limits | 20 different items, 10 of each |
| Not stored | prices that are trusted, totals, stock, customer details, payment details |

`seen` is the last unit price the shopper was shown for each SKU. It is only used to say
"Price updated (was Rs. 1,799)" and is never sent to the server.

The Phase 1–3A bag (`abzari-cart`, product slugs, no expiry) is discarded on first load. It only
existed on the preview (demo checkout).

Changes in another tab are picked up through the browser's `storage` event.

**Why not a cart table?** There are no customer accounts yet, so a server-side cart would need a
cookie id per anonymous visitor and a database write on every change (waking the metered Neon
compute for every browsing session), with nothing gained: the browser copy is never trusted
anyway. A table becomes worthwhile with accounts (bag on several devices) or abandoned-cart
emails; it can be added then without changing the quote API.

**Limitations:** the bag lives in one browser (not shared across devices); clearing site data or
private browsing loses it; it is not kept on the server, so the shop cannot see abandoned bags.

## Pricing

- Unit price = the variant's sale price when set, else its regular price; `compareAtMinor` is the
  regular price when on sale.
- Line total = unit × quantity; subtotal = sum of lines that can be bought ("ok"). All integer
  minor units (paise). No floating point anywhere.
- Prices are read on every quote, so a price change shows at the next check (bag load, change,
  opening the bag or checkout), with a "Price updated" note when it differs from what the shopper
  saw.
- No shipping, tax or discounts in this phase (the store's note "Free shipping across India.
  Taxes included." is unchanged).

## Inventory

| Status | Meaning | Shown as |
| --- | --- | --- |
| `ok` | That many can be bought now | price and line total |
| `insufficient_stock` | Fewer in stock than asked; `maxQuantity` says how many | "Only 2 available. Change to 2" |
| `sold_out` | Live product, nothing in stock | "Sold out. Remove it to continue." |
| `unavailable` | Unknown SKU, draft, archived, inactive variant, other store | "No longer available. Remove it to continue." (no details given) |

- Sellable = available − reserved, read on every quote.
- Checkout (`canCheckout`) is allowed only when the bag has items and every line is `ok`; the
  bag's Checkout button and the checkout page's Place order button stay disabled otherwise.
- Adding to the bag never deducts or reserves stock, and an `ok` line is not a promise: the
  bag says "Prices and availability are confirmed at checkout". Final checks and transactional
  reservation are Phase 4/5.
- **Stock exposure:** the quote reveals `maxQuantity`, capped at 10 (the per-item limit). Exact
  stock above 10 is never revealed; below it, the shopper learns how many are left (as most
  shops do with "only 2 left"). The public catalogue still only says in stock / low / out.
- **Unpublished products stay secret:** unknown, draft and archived SKUs give the same
  "unavailable" answer with no name or price, so guessing SKUs reveals nothing.

## Store isolation

The store comes from `src/config/store.ts` on the server, never from the request. The quote's
SQL statement looks the store up by that code and filters every table by its id, including the join to products
and images, so another store's SKU is simply "unavailable", and when two stores use the same SKU
each deployment sees its own. A request naming a store is refused. Tests:
`tests/cart/cart-quote.test.ts` ("store isolation").

## API

`POST /api/cart/quote`, see [API.md](API.md#cart).

## Failures

- Server or database unreachable: 503 with "We could not check your bag just now. Please try
  again in a moment." The bag keeps its items, prices show as unknown, checkout stays closed, and
  a "Try again" link rechecks.
- Only the kind of failure is logged (`kind`, `code`), never the bag's contents or the database
  error text (which can quote query parameters).

## Cost and performance

- One SQL statement per quote (it also finds the store, so a fresh Worker instance needs no extra
  lookup), only when a shopper has a bag. Browsing without a bag never calls it, and an empty bag
  is answered without the database.
- Worker CPU per quote and latency: see the PR / [DEPLOYMENT.md](DEPLOYMENT.md#checking-a-deployment).
- Neon's free plan includes 100 CU-hours a month and the database sleeps after 5 idle minutes. A
  quote wakes it; a small shop's bag activity costs a few CU-hours a month. If bag traffic ever
  kept the database awake around the clock (about 180 CU-hours at the minimum size), the fix is
  to read stock from the published catalogue copy in R2 (private field) instead.
- Responses are `Cache-Control: no-store`; nothing bag-specific is cached publicly.
- No rate limiting in the app. The endpoint is read-only and cheap; if abused, Cloudflare's free
  rate-limiting rule (one per zone, once the shop has its own domain) can cap it.
