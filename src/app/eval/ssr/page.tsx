import { getServerEnv } from '../../../server/env'
import { products } from '../../../data/products'
import ProductCard from '../../../components/ProductCard'

export const dynamic = 'force-dynamic'

// EVALUATION ONLY. Never committed. Renders the whole catalogue on the server per request.
export default async function EvalSsr() {
  const env = getServerEnv()
  const now = new Date().toISOString()
  return (
    <div className="page wrap">
      <h1 className="display">SSR {env.APP_ENV}</h1>
      <p id="ssr-meta" data-time={now} data-db={env.DATABASE_URL ? 'yes' : 'no'}>rendered {now}</p>
      <div className="grid">{products.map((p) => <ProductCard key={p.slug} p={p} />)}</div>
    </div>
  )
}
