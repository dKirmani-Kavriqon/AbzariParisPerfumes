import { notFound } from '../../../server/http/errors'
import { route } from '../../../server/http/route'

// Unknown /api/* paths answer with the standard JSON error instead of the HTML 404 page.
const missing = route(() => {
  throw notFound('There is no API endpoint at this address.')
})

export const dynamic = 'force-dynamic'
export { missing as GET, missing as POST, missing as PUT, missing as PATCH, missing as DELETE }
