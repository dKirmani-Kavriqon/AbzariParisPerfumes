# External integrations

One folder per outside service (`razorpay/`, `resend/`, ...), added in the phase that needs it.
Each adapter:

- is server-only (`import 'server-only'`) and reads its credentials through `src/server/env.ts`;
- exposes a small typed interface that `src/commerce` modules depend on, so the provider can be
  swapped or faked in tests;
- verifies anything the provider sends back (webhook signatures, payment signatures) before it is used;
- never logs request or response bodies that could contain personal or payment data.
