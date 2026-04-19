import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { KeywordSearchForm } from '@/components/content/KeywordSearchForm'
import { RunStepsPanel } from '@/components/content/RunStepsPanel'
import { ScriptResultsPanel } from '@/components/content/ScriptResultsPanel'
import type { VideoScript } from '@/components/content/types'
import { getApiBase } from '@/lib/api-base'
import type { RunStepKey, RunStepState } from '@/components/content/RunStepsPanel'

const createInitialSteps = (): RunStepState[] => [
  { key: 'search', label: 'Search web sources', status: 'pending' },
  { key: 'scrape', label: 'Scrape top links', status: 'pending' },
  { key: 'topics', label: 'Extract topic angles', status: 'pending' },
  { key: 'scripts', label: 'Generate scripts', status: 'pending' },
  { key: 'enrich', label: 'Generate video and Twitter posts', status: 'pending' },
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type EnrichmentPayload = {
  twitterPosts?: Array<{ scriptId: string; text: string }>
  firstScriptVideo?: {
    status: 'queued' | 'processing' | 'completed' | 'failed'
    jobId?: string
    publicUrl?: string
    error?: string
  }
}

export function GeneratePage() {
  const [brandBrief, setBrandBrief] = useState('')
  const [scripts, setScripts] = useState<VideoScript[]>([])
  const [runId, setRunId] = useState('')
  const [steps, setSteps] = useState<RunStepState[]>(createInitialSteps)
  const [isStepsExpanded, setIsStepsExpanded] = useState(false)
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false)
  const [statusText, setStatusText] = useState('Ready')
  const [errorText, setErrorText] = useState('')
  const apiBase = useMemo(() => getApiBase(), [])
  const hasRunActivity =
    isGeneratingFlow || runId.length > 0 || steps.some((step) => step.status !== 'pending')

  const setStepStatus = (key: RunStepKey, status: RunStepState['status']) => {
    setSteps((previous) =>
      previous.map((step) => {
        if (step.key === key) {
          return { ...step, status }
        }
        return step
      })
    )
  }

  const mergeEnrichment = (
    generatedScripts: VideoScript[],
    enrichment: EnrichmentPayload
  ) => {
    const twitterByScriptId = new Map((enrichment.twitterPosts ?? []).map((post) => [post.scriptId, post.text]))

    return generatedScripts.map((script, index) => {
      if (index !== 0) {
        return {
          ...script,
          twitterPost: twitterByScriptId.get(script.id),
        }
      }

      return {
        ...script,
        twitterPost: twitterByScriptId.get(script.id),
        videoStatus: enrichment.firstScriptVideo?.status,
        videoJobId: enrichment.firstScriptVideo?.jobId,
        videoUrl: enrichment.firstScriptVideo?.publicUrl,
        videoError: enrichment.firstScriptVideo?.error,
      }
    })
  }

  const onSubmitBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsGeneratingFlow(true)
    setErrorText('')
    setScripts([])
    setRunId('')
    setSteps(createInitialSteps())
    setIsStepsExpanded(false)

    type FlowStage = 'search' | 'scrape' | 'topics' | 'scripts' | 'enrich'
    let stage: FlowStage = 'search'

    try {
      setStepStatus('search', 'in_progress')
      setStatusText('Searching subjects and gathering web results...')
      const searchResponse = await fetch(`${apiBase}/api/research/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandBrief,
          topN: 10,
        }),
      })
      if (!searchResponse.ok) {
        throw new Error(`Request failed with ${searchResponse.status}`)
      }

      const searchPayload = (await searchResponse.json()) as { run: { id: string } }
      const nextRunId = searchPayload.run.id
      setRunId(nextRunId)
      setStepStatus('search', 'completed')

      stage = 'scrape'
      setStepStatus('scrape', 'in_progress')
      setStatusText('Reading top source pages...')
      const scrapeResponse = await fetch(`${apiBase}/api/research/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId: nextRunId,
          maxUrls: 5,
        }),
      })
      if (!scrapeResponse.ok) {
        throw new Error(`Request failed with ${scrapeResponse.status}`)
      }
      setStepStatus('scrape', 'completed')

      stage = 'topics'
      setStepStatus('topics', 'in_progress')
      setStatusText('Extracting high-signal topics...')
      const topicsResponse = await fetch(`${apiBase}/api/topics/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ runId: nextRunId }),
      })
      if (!topicsResponse.ok) {
        throw new Error(`Request failed with ${topicsResponse.status}`)
      }
      setStepStatus('topics', 'completed')

      const topicsPayload = (await topicsResponse.json()) as { topics: Array<{ id: string }> }
      const topicIds = (topicsPayload.topics ?? []).slice(0, 5).map((topic) => topic.id)

      stage = 'scripts'
      setStepStatus('scripts', 'in_progress')
      setStatusText('Generating final scripts...')
      const scriptsResponse = await fetch(`${apiBase}/api/scripts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId: nextRunId,
          topicIds: topicIds.length ? topicIds : undefined,
          count: 5,
        }),
      })
      if (!scriptsResponse.ok) {
        throw new Error(`Request failed with ${scriptsResponse.status}`)
      }

      const scriptsPayload = (await scriptsResponse.json()) as { scripts: VideoScript[] }
      const generatedScripts = scriptsPayload.scripts ?? []
      setScripts(generatedScripts)
      setStepStatus('scripts', 'completed')

      stage = 'enrich'
      setStepStatus('enrich', 'in_progress')
      setStatusText('Generating Twitter posts and video from script #1...')

      const enrichResponse = await fetch(`${apiBase}/api/scripts/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId: nextRunId,
          scripts: generatedScripts,
        }),
      })

      if (!enrichResponse.ok) {
        throw new Error(`Request failed with ${enrichResponse.status}`)
      }

      const enrichPayload = (await enrichResponse.json()) as EnrichmentPayload
      const enrichedScripts = mergeEnrichment(generatedScripts, enrichPayload)
      setScripts(enrichedScripts)

      let finalVideoStatus = enrichPayload.firstScriptVideo?.status
      if (finalVideoStatus === 'failed') {
        setStepStatus('enrich', 'failed')
        setStatusText('Twitter posts generated, but video generation failed.')
      } else {
        setStatusText('Twitter posts generated. Video job queued, waiting for updates...')

        for (let attempt = 1; attempt <= 40; attempt++) {
          await sleep(4000)

          const statusResponse = await fetch(
            `${apiBase}/api/scripts/enrich-status?runId=${encodeURIComponent(nextRunId)}`
          )
          if (!statusResponse.ok) {
            continue
          }

          const statusPayload = (await statusResponse.json()) as EnrichmentPayload
          setScripts((previous) => mergeEnrichment(previous, statusPayload))
          finalVideoStatus = statusPayload.firstScriptVideo?.status

          if (finalVideoStatus === 'completed') {
            setStepStatus('enrich', 'completed')
            setStatusText(`Scripts generated (${generatedScripts.length}) with video + Twitter posts.`)
            break
          }

          if (finalVideoStatus === 'failed') {
            setStepStatus('enrich', 'failed')
            setStatusText('Twitter posts generated, but video generation failed.')
            break
          }

          setStatusText(`Twitter posts ready. Video is ${finalVideoStatus ?? 'queued'}...`)
        }

        if (finalVideoStatus !== 'completed' && finalVideoStatus !== 'failed') {
          setStepStatus('enrich', 'completed')
          setStatusText('Twitter posts are ready. Video is still processing; refresh Runs later for final link.')
        }
      }
    } catch (error) {
      const stageLabel =
        stage === 'search'
          ? 'subject search'
          : stage === 'scrape'
            ? 'source scraping'
            : stage === 'topics'
              ? 'topic extraction'
              : stage === 'scripts'
                ? 'script generation'
                : 'enrichment'

      setStepStatus(stage, 'failed')
      setErrorText(error instanceof Error ? error.message : `Failed during ${stageLabel}.`)
      setStatusText(`Failed during ${stageLabel}.`)
    } finally {
      setIsGeneratingFlow(false)
    }
  }

  return (
    <>
      <KeywordSearchForm
        brandBrief={brandBrief}
        isSubmitting={isGeneratingFlow}
        onBrandBriefChange={setBrandBrief}
        onSubmit={(event) => void onSubmitBrief(event)}
      />

      {hasRunActivity ? (
        <>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{statusText}</p>
            {errorText ? <p className="text-destructive">Error: {errorText}</p> : null}
          </div>

          <RunStepsPanel
            isExpanded={isStepsExpanded}
            onToggleExpanded={() => setIsStepsExpanded((previous) => !previous)}
            runId={runId || undefined}
            steps={steps}
          />
        </>
      ) : null}

      <ScriptResultsPanel scripts={scripts} />
    </>
  )
}
