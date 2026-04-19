import { createClient } from '@supabase/supabase-js'

const getEnv = () =>
  (
    globalThis as {
      process?: { env?: Record<string, string | undefined> }
    }
  ).process?.env ?? {}

export const requireEnv = (name: string): string => {
  const value = getEnv()[name]
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export const optionalEnv = (name: string): string | undefined => getEnv()[name]

export const getSupabaseAdmin = () => {
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
