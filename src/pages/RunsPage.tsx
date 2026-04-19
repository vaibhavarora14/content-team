import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScriptResultsPanel } from '@/components/content/ScriptResultsPanel'
import type { VideoScript } from '@/components/content/types'
import { getApiBase } from '@/lib/api-base'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type RunSummary = {
  id: string
  brandBrief: string
  status: string
  createdAt: string
  scriptCount: number
}

export function RunsPage() {
  const [runId, setRunId] = useState('')
  const [scripts, setScripts] = useState<VideoScript[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [isLoadingRun, setIsLoadingRun] = useState(false)
  const [statusText, setStatusText] = useState('Enter a run ID to load scripts.')
  const apiBase = useMemo(() => getApiBase(), [])

  const loadRuns = async () => {
    setIsLoadingRuns(true)
    try {
      const response = await fetch(`${apiBase}/api/runs`)
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const payload = (await response.json()) as { runs: RunSummary[] }
      setRuns(payload.runs ?? [])
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Could not load previous runs.')
    } finally {
      setIsLoadingRuns(false)
    }
  }

  useEffect(() => {
    void loadRuns()
  }, [])

  const loadRunSnapshot = async (requestedRunId?: string) => {
    const nextRunId = requestedRunId ?? runId
    if (!nextRunId.trim()) {
      setStatusText('Enter a run id to load.')
      return
    }

    setIsLoadingRun(true)
    setStatusText('Loading run snapshot...')

    try {
      const response = await fetch(`${apiBase}/api/runs/${nextRunId}`)
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const payload = (await response.json()) as {
        run: { id: string }
        videoScripts: Array<{
          id: string
          title: string
          hook: string
          body_points: string[]
          cta: string
          duration_sec: number
        }>
        enrichment?: {
          twitterPosts?: Array<{ scriptId: string; text: string }>
          firstScriptVideo?: {
            status: 'queued' | 'processing' | 'completed' | 'failed'
            jobId?: string
            publicUrl?: string
            error?: string
          }
        } | null
      }

      const twitterByScriptId = new Map(
        (payload.enrichment?.twitterPosts ?? []).map((post) => [post.scriptId, post.text])
      )

      setScripts(
        (payload.videoScripts ?? []).map((script, index) => {
          const baseScript: VideoScript = {
            id: script.id,
            title: script.title,
            hook: script.hook,
            bodyPoints: script.body_points ?? [],
            cta: script.cta,
            durationSec: script.duration_sec,
            twitterPost: twitterByScriptId.get(script.id),
          }

          if (index !== 0) {
            return baseScript
          }

          return {
            ...baseScript,
            videoStatus: payload.enrichment?.firstScriptVideo?.status,
            videoJobId: payload.enrichment?.firstScriptVideo?.jobId,
            videoUrl: payload.enrichment?.firstScriptVideo?.publicUrl,
            videoError: payload.enrichment?.firstScriptVideo?.error,
          }
        })
      )
      setStatusText(`Loaded run ${payload.run.id}.`)
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Run load failed.')
    } finally {
      setIsLoadingRun(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Runs</CardTitle>
          <CardDescription>See previous runs and load scripts from any row.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              onChange={(event) => setRunId(event.target.value)}
              placeholder="Run id"
              value={runId}
            />
            <Button onClick={() => void loadRunSnapshot()} type="button" variant="secondary">
              {isLoadingRun ? 'Loading...' : 'Load'}
            </Button>
            <Button onClick={() => void loadRuns()} type="button" variant="outline">
              {isLoadingRuns ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scripts</TableHead>
                <TableHead>Brief</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length ? (
                runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell>{run.scriptCount}</TableCell>
                    <TableCell className="max-w-md truncate">{run.brandBrief}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        onClick={() => {
                          setRunId(run.id)
                          void loadRunSnapshot(run.id)
                        }}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        Load
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    {isLoadingRuns ? 'Loading previous runs...' : 'No runs found yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-1 text-sm text-muted-foreground">
          <p>{statusText}</p>
        </CardFooter>
      </Card>

      <ScriptResultsPanel scripts={scripts} />
    </>
  )
}
