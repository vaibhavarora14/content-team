import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { TopicCandidate } from './types'

type TopicCandidatesProps = {
  topics: TopicCandidate[]
  selectedTopicIds: string[]
  onToggleTopic: (id: string) => void
  onExtractTopics: () => void
  onGenerateScripts: () => void
  isExtracting: boolean
  isGenerating: boolean
}

export function TopicCandidates(props: TopicCandidatesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>4) Topic candidates</CardTitle>
        <CardDescription>Select topics to generate 4-5 short scripts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={props.onExtractTopics} disabled={props.isExtracting}>
            {props.isExtracting ? 'Extracting...' : 'Extract topics'}
          </Button>
          <Button
            type="button"
            onClick={props.onGenerateScripts}
            disabled={!props.topics.length || props.isGenerating}
          >
            {props.isGenerating ? 'Generating...' : 'Generate scripts'}
          </Button>
        </div>

        <div className="space-y-2">
          {props.topics.length ? (
            props.topics.map((topic) => {
              const isSelected = props.selectedTopicIds.includes(topic.id)
              return (
                <button
                  className={`w-full rounded-md border p-3 text-left transition ${
                    isSelected ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                  key={topic.id}
                  onClick={() => props.onToggleTopic(topic.id)}
                  type="button"
                >
                  <p className="font-medium">{topic.title}</p>
                  <p className="text-sm text-muted-foreground">{topic.angle}</p>
                  <p className="text-xs text-muted-foreground">{topic.whyNow}</p>
                </button>
              )
            })
          ) : (
            <p className="text-sm text-muted-foreground">No topics yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
