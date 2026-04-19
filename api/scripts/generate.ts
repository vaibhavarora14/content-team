import { getRun, setRunScripts, setRunStatus } from '../_lib/dev-store.js'
import { json, parseJsonBody } from '../_lib/http.js'
import { generateScripts } from '../_lib/llm.js'
import { getSupabaseAdmin, optionalEnv } from '../_lib/supabase.js'

export const config = {
  runtime: 'edge',
}

type GenerateScriptsRequest = {
  runId?: string
  topicIds?: string[]
  count?: number
}

type SearchRunRow = {
  brand_brief: string
}

type TopicRow = {
  id: string
  title: string
  angle: string
  why_now: string
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405)
    }

    const body = await parseJsonBody<GenerateScriptsRequest>(request)
    const runId = body?.runId?.trim()
    if (!runId) {
      return json({ error: 'runId is required.' }, 400)
    }

    const count = Math.max(4, Math.min(5, body.count ?? 5))
    const supabase = getSupabaseAdmin()
    const fallbackRun = getRun(runId)
    const usingFallbackStore = Boolean(fallbackRun)
    let run: SearchRunRow | null = null
    let topicRows: TopicRow[] = []

    if (usingFallbackStore) {
      run = { brand_brief: fallbackRun?.brandBrief ?? '' }
      topicRows = (fallbackRun?.topicCandidates ?? []).map((topic) => ({
        id: topic.id,
        title: topic.title,
        angle: topic.angle,
        why_now: topic.whyNow,
      }))
      if (body.topicIds?.length) {
        topicRows = topicRows.filter((topic) => body.topicIds?.includes(topic.id))
      }
      topicRows = topicRows.slice(0, 5)
    } else {
      const runResponse = await supabase
        .from('search_runs')
        .select('brand_brief')
        .eq('id', runId)
        .single()

      if (runResponse.error || !runResponse.data) {
        return json({ error: runResponse.error?.message ?? 'Run not found.' }, 404)
      }
      run = runResponse.data as SearchRunRow

      let topicQuery = supabase
        .from('topic_candidates')
        .select('id, title, angle, why_now')
        .eq('run_id', runId)
        .order('confidence', { ascending: false })
        .limit(5)

      if (body.topicIds?.length) {
        topicQuery = topicQuery.in('id', body.topicIds)
      }

      const { data: topics, error: topicsError } = await topicQuery
      if (topicsError) {
        return json({ error: topicsError.message }, 500)
      }
      topicRows = (topics ?? []) as TopicRow[]
    }

    if (!topicRows.length) {
      return json({ error: 'No topics available. Run topic extraction first.' }, 400)
    }

    const generation = await generateScripts({
      brandBrief: (run as SearchRunRow).brand_brief,
      topics: topicRows.map((topic) => ({
        title: topic.title,
        angle: topic.angle,
        whyNow: topic.why_now,
      })),
      count,
    })

    let responseScripts: Array<{
      id: string
      title: string
      hook: string
      bodyPoints: string[]
      cta: string
      voiceoverScript?: string
      durationSec: number
    }> = []

    if (usingFallbackStore) {
      const saved = setRunScripts(runId, generation.scripts)
      setRunStatus(runId, 'scripts_done')
      responseScripts = saved.map((script) => ({
        id: script.id,
        title: script.title,
        hook: script.hook,
        bodyPoints: script.bodyPoints,
        cta: script.cta,
        voiceoverScript: script.voiceoverScript,
        durationSec: script.durationSec,
      }))
    } else {
      const inserts = generation.scripts.map((script, index) => ({
        run_id: runId,
        topic_candidate_id: topicRows[index % topicRows.length]?.id ?? null,
        title: script.title,
        hook: script.hook,
        body_points: script.bodyPoints,
        cta: script.cta,
        duration_sec: script.durationSec,
        llm_provider: 'zen',
        llm_model: optionalEnv('LLM_MODEL'),
        llm_endpoint: '/responses',
        prompt_version: 'scripts_v1',
        token_usage_json: generation.usage ?? null,
      }))

      const { data: scripts, error: scriptsError } = await supabase
        .from('video_scripts')
        .insert(inserts)
        .select('id, title, hook, body_points, cta, duration_sec')

      if (scriptsError) {
        return json({ error: scriptsError.message }, 500)
      }

      await supabase
        .from('search_runs')
        .update({
          status: 'scripts_done',
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId)

      responseScripts = (scripts ?? []).map((script, index) => ({
        id: script.id,
        title: script.title,
        hook: script.hook,
        bodyPoints: (script.body_points as string[]) ?? [],
        cta: script.cta,
        voiceoverScript: generation.scripts[index]?.voiceoverScript,
        durationSec: script.duration_sec,
      }))
    }

    return json({
      scripts: responseScripts,
      usage: generation.usage,
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
