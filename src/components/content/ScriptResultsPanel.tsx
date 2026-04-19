import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { VideoScript } from './types'

type ScriptResultsPanelProps = {
  scripts: VideoScript[]
  onCreateVideo?: () => void
  isCreatingVideo?: boolean
}

const formatScriptForCopy = (script: VideoScript) =>
  `${script.title}

Hook: ${script.hook}

Body:
${script.bodyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}

CTA: ${script.cta}
Duration: ${script.durationSec}s`

const getTwitterIntentUrl = (text: string) =>
  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`

const getVideoStatusLabel = (status: VideoScript['videoStatus']) => {
  if (status === 'not_started') return 'Not started'
  if (status === 'queued') return 'Queued'
  if (status === 'processing') return 'Processing'
  if (status === 'completed') return 'Ready'
  if (status === 'failed') return 'Failed'
  return 'Not started'
}

const getTwitterStatusLabel = (status: VideoScript['twitterStatus']) => {
  if (status === 'pending') return 'Pending'
  if (status === 'processing') return 'Processing'
  if (status === 'completed') return 'Ready'
  if (status === 'failed') return 'Failed'
  return 'Not started'
}

export function ScriptResultsPanel(props: ScriptResultsPanelProps) {
  if (!props.scripts.length) {
    return null
  }

  const onCopy = async (script: VideoScript) => {
    try {
      await navigator.clipboard.writeText(formatScriptForCopy(script))
    } catch {
      // Silent fallback for environments without clipboard permissions.
    }
  }

  const onCopyTweet = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Silent fallback for environments without clipboard permissions.
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated scripts</CardTitle>
        <CardDescription>Each script is optimized for 30-60 second videos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.scripts.map((script, index) => (
          <div className="space-y-2 rounded-md border p-3" key={script.id}>
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{script.title}</p>
              <Button onClick={() => void onCopy(script)} size="sm" type="button" variant="outline">
                Copy
              </Button>
            </div>
            <p className="text-sm">
              <span className="font-medium">Hook:</span> {script.hook}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {script.bodyPoints.map((point, index) => (
                <li key={`${script.id}-point-${index}`}>{point}</li>
              ))}
            </ul>
            <p className="text-sm">
              <span className="font-medium">CTA:</span> {script.cta}
            </p>
            <p className="text-xs text-muted-foreground">Duration: {script.durationSec}s</p>

            {index === 0 ? (
              <div className="space-y-2 rounded-md bg-muted/40 p-3">
                <p className="text-sm font-medium">Video (from script #1)</p>
                <p className="text-xs text-muted-foreground">Status: {getVideoStatusLabel(script.videoStatus)}</p>
                {(script.videoStatus === 'not_started' || !script.videoStatus) && props.onCreateVideo ? (
                  <div className="space-y-1">
                    <Button
                      disabled={props.isCreatingVideo}
                      onClick={() => props.onCreateVideo?.()}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      {props.isCreatingVideo ? 'Starting video...' : 'Create Video'}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Twitter posts are generated first. Click Create Video to start rendering script #1.
                    </p>
                  </div>
                ) : null}
                {script.videoUrl ? (
                  <>
                    <video className="max-h-96 w-full rounded-md border bg-black/80" controls src={script.videoUrl} />
                    <p className="text-xs text-muted-foreground break-all">{script.videoUrl}</p>
                  </>
                ) : script.videoStatus === 'failed' ? (
                  <p className="text-sm text-destructive">{script.videoError ?? 'Video generation failed.'}</p>
                ) : script.videoStatus === 'queued' || script.videoStatus === 'processing' ? (
                  <p className="text-sm text-muted-foreground">Video is being generated in the background.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Video is optional for this run. Click Create Video to generate it for script #1.
                  </p>
                )}
              </div>
            ) : null}

            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <p className="text-sm font-medium">Twitter post</p>
              <p className="text-xs text-muted-foreground">Status: {getTwitterStatusLabel(script.twitterStatus)}</p>
              {script.twitterPost ? (
                <>
                  <p className="text-sm whitespace-pre-wrap">{script.twitterPost}</p>
                  <div className="flex gap-2">
                    <Button onClick={() => void onCopyTweet(script.twitterPost || '')} size="sm" type="button" variant="outline">
                      Copy Tweet
                    </Button>
                    <Button
                      onClick={() => window.open(getTwitterIntentUrl(script.twitterPost || ''), '_blank', 'noopener,noreferrer')}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      Share on X
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Twitter post unavailable or enrichment is still running.</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
