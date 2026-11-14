import Link from 'next/link'

/** Shown for unknown products and any other unknown address. */
export default function NotFound() {
  return (
    <div className="page wrap narrow">
      <h1 className="display">Not found</h1>
      <p>That fragrance is not in the collection. <Link href="/shop">See everything we make.</Link></p>
    </div>
  )
}
