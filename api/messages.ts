import { createClient } from '@supabase/supabase-js'

export const config = {
  runtime: 'edge',
}

type MessageRow = {
  id: number
  name: string
  content: string
  created_at: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })

const getSupabaseAdmin = () => {
  const env =
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env ?? {}
  const supabaseUrl = env.SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.'
    )
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export default async function handler(request: Request): Promise<Response> {
  try {
    const supabase = getSupabaseAdmin()

    if (request.method === 'GET') {
      const { data, error } = await supabase
        .from('messages')
        .select('id, name, content, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        return json({ error: error.message }, 500)
      }

      return json({ messages: (data ?? []) as MessageRow[] })
    }

    if (request.method === 'POST') {
      const body = (await request.json()) as {
        name?: string
        content?: string
      }

      const name = body.name?.trim()
      const content = body.content?.trim()

      if (!name || !content) {
        return json({ error: 'name and content are required.' }, 400)
      }

      const { data, error } = await supabase
        .from('messages')
        .insert([{ name, content }])
        .select('id, name, content, created_at')
        .single()

      if (error) {
        return json({ error: error.message }, 500)
      }

      return json({ message: data as MessageRow }, 201)
    }

    return json({ error: 'Method not allowed.' }, 405)
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unexpected server error.',
      },
      500
    )
  }
}
