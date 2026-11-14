// Fails if browser-delivered files contain secret names, secret-looking values or
// server-only code. Run after a build:  npm run check:bundle [-- <dir> ...]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['.next/static']
const forbidden = [
  [/DATABASE_URL|HEALTH_CHECK_TOKEN|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|RESEND_API_KEY/, 'server secret name'],
  [/postgres(ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/, 'database connection string'],
  [/\brzp_live_[A-Za-z0-9]{8,}|\bre_[A-Za-z0-9]{20,}|\bnapi_[a-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY/, 'credential'],
  [/@neondatabase\/serverless|drizzle-orm\/neon-http|pg_advisory|neon_auth/, 'server-only database code'],
]

const files = []
const walk = (d) => {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|mjs|css|html|json|map|txt)$/.test(name)) files.push(p)
  }
}
for (const d of dirs) walk(d)

let problems = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  for (const [re, what] of forbidden) {
    if (re.test(text)) {
      problems++
      console.error(`✗ ${f}: contains ${what}`)
    }
  }
}
console.log(`${problems ? '✗' : '✓'} scanned ${files.length} browser files in ${dirs.join(', ')}: ${problems} problem(s)`)
process.exit(problems ? 1 : 0)
