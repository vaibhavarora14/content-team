import { Button } from '@/components/ui/button'

export type RunStepKey = 'search' | 'scrape' | 'topics' | 'scripts' | 'enrich'
export type RunStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export type RunStepState = {
  key: RunStepKey
  label: string
  status: RunStepStatus
}

type RunStepsPanelProps = {
  steps: RunStepState[]
  runId?: string
  isExpanded: boolean
  onToggleExpanded: () => void
}

const statusLabel: Record<RunStepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  failed: 'Failed',
}

const statusClassName: Record<RunStepStatus, string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-blue-600',
  completed: 'text-emerald-600',
  failed: 'text-destructive',
}

export function RunStepsPanel(props: RunStepsPanelProps) {
  const completedCount = props.steps.filter((step) => step.status === 'completed').length
  const inProgressCount = props.steps.filter((step) => step.status === 'in_progress').length
  const failedCount = props.steps.filter((step) => step.status === 'failed').length
  const summary = `${completedCount}/${props.steps.length} completed • ${inProgressCount} in progress${
    failedCount ? ` • ${failedCount} failed` : ''
  }`

  return (
    <section className="border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Run progress</h3>
        <Button onClick={props.onToggleExpanded} size="sm" type="button" variant="ghost">
          {props.isExpanded ? 'Hide details' : 'Show details'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{summary}</p>
      {props.runId ? <p className="text-xs text-muted-foreground">Run ID: {props.runId}</p> : null}

      {props.isExpanded ? (
        <ol className="mt-3 space-y-2">
          {props.steps.map((step, index) => (
            <li className="flex items-center justify-between rounded-md border px-3 py-2" key={step.key}>
              <span className="text-sm">
                {index + 1}. {step.label}
              </span>
              <span className={`text-xs font-medium ${statusClassName[step.status]}`}>
                {statusLabel[step.status]}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
