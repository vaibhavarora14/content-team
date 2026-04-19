import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SourceDocument } from './types'

type SourceDocumentPreviewProps = {
  documents: SourceDocument[]
}

export function SourceDocumentPreview(props: SourceDocumentPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>3) Scraped evidence</CardTitle>
        <CardDescription>
          We use these snippets as source context while extracting topics.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.documents.length ? (
          props.documents.map((document) => (
            <div className="rounded-md border p-3" key={document.id}>
              <p className="font-medium">{document.title || document.url}</p>
              <p className="truncate text-xs text-muted-foreground">{document.url}</p>
              <p className="mt-2 text-sm text-muted-foreground">{document.preview}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No scraped documents yet.</p>
        )}
      </CardContent>
    </Card>
  )
}
