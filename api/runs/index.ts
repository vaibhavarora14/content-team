import { json } from '../_lib/http.js'
import { listRuns } from '../_lib/dev-store.js'
import { getSupabaseAdmin } from '../_lib/supabase.js'

export const config = {
  runtime: 'edge',
}

type RunRow = {
  id: string
  brand_brief: string
  status: string
  created_at: string
}

type ScriptCountRow = {
  run_id: string
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const fallbackRuns = listRuns()
    if (fallbackRuns.length) {
      return json({
        runs: fallbackRuns.map((run) => ({
          id: run.id,
          brandBrief: run.brandBrief,
          status: run.status,
          createdAt: run.createdAt,
          scriptCount: run.scriptCount,
        })),
      })
    }

    const supabase = getSupabaseAdmin()
    const { data: runsData, error: runsError } = await supabase
      .from('search_runs')
      .select('id, brand_brief, status, created_at')
      .order('created_at', { ascending: false })
      .limit(30)

    if (runsError) {
      return json({ error: runsError.message }, 500)
    }

    const runs = (runsData ?? []) as RunRow[]
    if (!runs.length) {
      return json({ runs: [] })
    }

    const runIds = runs.map((run) => run.id)
    const { data: scriptsData, error: scriptsError } = await supabase
      .from('video_scripts')
      .select('run_id')
      .in('run_id', runIds)

    if (scriptsError) {
      return json({ error: scriptsError.message }, 500)
    }

    const scriptCounts = new Map<string, number>()
    ;((scriptsData ?? []) as ScriptCountRow[]).forEach((row) => {
      scriptCounts.set(row.run_id, (scriptCounts.get(row.run_id) ?? 0) + 1)
    })

    return json({
      runs: runs.map((run) => ({
        id: run.id,
        brandBrief: run.brand_brief,
        status: run.status,
        createdAt: run.created_at,
        scriptCount: scriptCounts.get(run.id) ?? 0,
      })),
    })
  } catch (error) {
    return json(
      {
        error: error instanceof Error ? error.message : 'Unexpected server error.',
      },
      500
    )
  }
}
