import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { VideoScript } from './types'

type ScriptResultsPanelProps = {
  scripts: VideoScript[]
}

const formatScriptForCopy = (script: VideoScript) =>
  `${script.title}

Hook: ${script.hook}

Body:
${script.bodyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}

CTA: ${script.cta}
Duration: ${script.durationSec}s`

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generated scripts</CardTitle>
        <CardDescription>Each script is optimized for 30-60 second videos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.scripts.map((script) => (
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
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
