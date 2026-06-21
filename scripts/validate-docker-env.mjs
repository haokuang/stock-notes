const mode = process.argv[2]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function requireNames(names) {
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    fail(`Missing required build environment variables: ${missing.join(', ')}`)
  }
}

if (mode === 'web') {
  requireNames(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
} else if (mode === 'mini') {
  requireNames(['PROJECT_DOMAIN'])
  if (!process.env.PROJECT_DOMAIN.startsWith('https://')) {
    fail('PROJECT_DOMAIN must use https for a production mini-program build')
  }
} else {
  fail('Usage: node scripts/validate-docker-env.mjs <web|mini>')
}
