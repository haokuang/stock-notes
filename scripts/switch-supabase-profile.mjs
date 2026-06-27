#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const MANAGED_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ACCESS_TOKEN',
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'SUPABASE_DB_PASSWORD',
  'DATABASE_SSL',
  'DB_CONNECTION_PROFILE',
]

const dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(dirname, '..')

export function parseEnvText(text) {
  const out = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index < 0) continue
    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (key) out[key] = value
  }
  return out
}

export function mergeEnvText(currentText, profileEnv) {
  const managed = new Set(MANAGED_KEYS)
  const seen = new Set()
  const lines = currentText.split(/\r?\n/)
  const merged = lines.map((rawLine) => {
    const match = rawLine.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)
    if (!match) return rawLine
    const key = match[1]
    if (!managed.has(key)) return rawLine
    seen.add(key)
    return `${key}=${profileEnv[key] ?? ''}`
  })

  for (const key of MANAGED_KEYS) {
    if (!seen.has(key)) merged.push(`${key}=${profileEnv[key] ?? ''}`)
  }

  return `${merged.join('\n').replace(/\n+$/, '')}\n`
}

function parseArgs(argv) {
  const args = [...argv]
  const profile = args.shift()
  const options = {
    envFile: path.join(rootDir, '.env.local'),
    profileDir: path.join(rootDir, '.env.profiles'),
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--env-file') options.envFile = path.resolve(args[++index] ?? '')
    else if (arg === '--profile-dir') options.profileDir = path.resolve(args[++index] ?? '')
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (!profile || profile === '--help' || profile === '-h') {
    return { help: true, ...options }
  }
  return { profile, ...options }
}

function printHelp() {
  console.log([
    'Usage: pnpm supabase:switch <profile>',
    '',
    'Examples:',
    '  pnpm supabase:switch aliyun',
    '  pnpm supabase:switch tokyo',
    '',
    'Profile file:',
    '  .env.profiles/<profile>.env',
    '',
    'Only Supabase/database connection keys are changed. Other .env.local values stay untouched.',
  ].join('\n'))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  const profileFile = path.join(args.profileDir, `${args.profile}.env`)
  if (!fs.existsSync(profileFile)) {
    throw new Error(`Profile not found: ${path.relative(rootDir, profileFile)}`)
  }
  if (!fs.existsSync(args.envFile)) {
    throw new Error(`Env file not found: ${path.relative(rootDir, args.envFile)}`)
  }

  const profileEnv = parseEnvText(fs.readFileSync(profileFile, 'utf8'))
  const currentText = fs.readFileSync(args.envFile, 'utf8')
  const nextText = mergeEnvText(currentText, profileEnv)
  fs.writeFileSync(args.envFile, nextText)

  const changedKeys = MANAGED_KEYS.filter((key) => profileEnv[key])
  console.log(`Switched Supabase profile to "${args.profile}".`)
  console.log(`Updated keys: ${changedKeys.join(', ') || '(managed keys cleared)'}`)
  console.log('Restart the backend service for changes to take effect.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
