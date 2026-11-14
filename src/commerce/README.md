# Commerce engine

The reusable part of the platform: business rules that are the same for every client store.
Nothing here is specific to Abzari Paris. Client differences live in `src/config/store.ts`
and in each client's own database.

## Rules for code in this folder

1. **No framework imports.** No `next/*`, `react`, or imports from `src/app`, `src/views` or
   `src/components`. This keeps the engine testable and movable to its own package later.
2. **Dependencies come in as arguments.** Functions take the database (`Database` from
   `src/server/db/client`) and integrations (payment, email) as parameters instead of
   creating them, so tests can pass fakes.
3. **Money is integer paise.** Never floating point. Prices are always recalculated on the
   server; amounts from the browser are never trusted.
4. **Throw `AppError`s** from `src/server/http/errors` for expected failures (out of stock,
   invalid coupon). API routes turn them into the standard error response.
5. **Each module owns its tables.** Schema files live in `src/server/db/schema/<module>.ts`.

## Planned modules

| Module | Phase | Responsibility |
| --- | --- | --- |
| `catalog/` | 2 | Products, variants, prices, stock levels |
| `cart/` | 2 | Server-side cart pricing and validation |
| `checkout/` | 2 | Address, shipping rules, order creation |
| `orders/` | 2–5 | Order lifecycle and status history |
| `payments/` | 3 | Payment intent and verification, provider-agnostic (Razorpay adapter in `src/server/integrations`) |
| `notifications/` | 4 | Which emails go out when (Resend adapter in `src/server/integrations`) |
| `admin/` | 5 | Store owner operations |

Modules are added when their phase starts, not before.
