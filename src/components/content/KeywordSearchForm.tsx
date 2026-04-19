import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type KeywordSearchFormProps = {
  brandBrief: string
  onBrandBriefChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onUseExampleBrief: () => void
  isSubmitting: boolean
}

export function KeywordSearchForm(props: KeywordSearchFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate scripts</CardTitle>
        <CardDescription>
          Describe the subject, audience, and context. We will run research and script generation in one
          flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={props.onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="brand-brief">Brand brief</Label>
            <Textarea
              id="brand-brief"
              value={props.brandBrief}
              onChange={(event) => props.onBrandBriefChange(event.target.value)}
              placeholder="Example: We sell protein bars for busy professionals who want clean ingredients and sustained energy."
              required
            />
            {!props.brandBrief.trim().length ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-full px-3 text-xs"
                  onClick={props.onUseExampleBrief}
                  disabled={props.isSubmitting}
                >
                  Use example
                </Button>
              </div>
            ) : null}
          </div>

          <Button type="submit" disabled={props.isSubmitting}>
            {props.isSubmitting ? 'Generating scripts...' : 'Generate scripts'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
