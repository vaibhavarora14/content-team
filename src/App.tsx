import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { KeywordSearchForm } from '@/components/content/KeywordSearchForm'
import { ScriptResultsPanel } from '@/components/content/ScriptResultsPanel'
import type { VideoScript } from '@/components/content/types'

const getApiBase = () => {
  const value = import.meta.env.VITE_EDGE_API_URL?.trim()
  if (!value) {
    return ''
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

function App() {
  const [brandBrief, setBrandBrief] = useState('')
  const [gl, setGl] = useState('us')
  const [hl, setHl] = useState('en')
  const [runId, setRunId] = useState('')
  const [scripts, setScripts] = useState<VideoScript[]>([])
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false)
  const [isLoadingRun, setIsLoadingRun] = useState(false)
  const [statusText, setStatusText] = useState('Ready')
  const [errorText, setErrorText] = useState('')
  const apiBase = useMemo(() => getApiBase(), [])

  const onSubmitBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsGeneratingFlow(true)
    setErrorText('')
    setScripts([])

    type FlowStage = 'search' | 'scrape' | 'topics' | 'scripts'
    let stage: FlowStage = 'search'

    try {
      setStatusText('Searching subjects and gathering web results...')
      const searchResponse = await fetch(`${apiBase}/api/research/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandBrief,
          gl,
          hl,
          topN: 10,
        }),
      })
      if (!searchResponse.ok) {
        throw new Error(`Request failed with ${searchResponse.status}`)
      }

      const searchPayload = (await searchResponse.json()) as { run: { id: string } }
      const nextRunId = searchPayload.run.id
      setRunId(nextRunId)

      stage = 'scrape'
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

      stage = 'topics'
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

      const topicsPayload = (await topicsResponse.json()) as { topics: Array<{ id: string }> }
      const topicIds = (topicsPayload.topics ?? []).slice(0, 5).map((topic) => topic.id)

      stage = 'scripts'
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
      setStatusText(`Scripts generated (${generatedScripts.length}).`)
    } catch (error) {
      const stageLabel =
        stage === 'search'
          ? 'subject search'
          : stage === 'scrape'
            ? 'source scraping'
            : stage === 'topics'
              ? 'topic extraction'
              : 'script generation'

      setErrorText(error instanceof Error ? error.message : `Failed during ${stageLabel}.`)
      setStatusText(`Failed during ${stageLabel}.`)
    } finally {
      setIsGeneratingFlow(false)
    }
  }

  const loadRunSnapshot = async () => {
    if (!runId.trim()) {
      setErrorText('Enter a run id to load.')
      return
    }

    setIsLoadingRun(true)
    setErrorText('')
    setStatusText('Loading run snapshot...')

    try {
      const response = await fetch(`${apiBase}/api/runs/${runId}`)
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const payload = (await response.json()) as {
        run: { id: string; brand_brief: string; gl: string; hl: string }
        videoScripts: Array<{
          id: string
          title: string
          hook: string
          body_points: string[]
          cta: string
          duration_sec: number
        }>
      }

      setRunId(payload.run.id)
      setBrandBrief(payload.run.brand_brief)
      setGl(payload.run.gl)
      setHl(payload.run.hl)
      setScripts(
        (payload.videoScripts ?? []).map((script) => ({
          id: script.id,
          title: script.title,
          hook: script.hook,
          bodyPoints: script.body_points ?? [],
          cta: script.cta,
          durationSec: script.duration_sec,
        }))
      )
      setStatusText(`Loaded run ${payload.run.id}.`)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Could not load run.')
      setStatusText('Run load failed.')
    } finally {
      setIsLoadingRun(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Subject-First Script Generator</CardTitle>
          <CardDescription>
            Enter a brief and generate 4-5 short scripts in one click. Research and topic extraction run
            automatically in the background.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Frontend: Vite + React</Badge>
          <Badge variant="outline">Research: Oxylabs</Badge>
          <Badge variant="outline">Generation: Zen /responses</Badge>
          <Badge variant="outline">Storage: Supabase</Badge>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-1 text-sm text-muted-foreground">
          <p>{statusText}</p>
          {errorText ? <p className="text-destructive">Error: {errorText}</p> : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Load existing run</CardTitle>
          <CardDescription>Use a previous run id to restore generated scripts.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            onChange={(event) => setRunId(event.target.value)}
            placeholder="Run id"
            value={runId}
          />
          <Button onClick={() => void loadRunSnapshot()} type="button" variant="secondary">
            {isLoadingRun ? 'Loading...' : 'Load'}
          </Button>
        </CardContent>
      </Card>

      <KeywordSearchForm
        brandBrief={brandBrief}
        gl={gl}
        hl={hl}
        isSubmitting={isGeneratingFlow}
        onBrandBriefChange={setBrandBrief}
        onGlChange={setGl}
        onHlChange={setHl}
        onSubmit={(event) => void onSubmitBrief(event)}
      />

      <ScriptResultsPanel scripts={scripts} />
    </main>
  )
}

export default App
