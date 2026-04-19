import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type KeywordSearchFormProps = {
  brandBrief: string
  gl: string
  hl: string
  onBrandBriefChange: (value: string) => void
  onGlChange: (value: string) => void
  onHlChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
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
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="gl">Google region (gl)</Label>
              <Input
                id="gl"
                value={props.gl}
                onChange={(event) => props.onGlChange(event.target.value)}
                placeholder="us"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hl">Language (hl)</Label>
              <Input
                id="hl"
                value={props.hl}
                onChange={(event) => props.onHlChange(event.target.value)}
                placeholder="en"
                required
              />
            </div>
          </div>

          <Button type="submit" disabled={props.isSubmitting}>
            {props.isSubmitting ? 'Generating scripts...' : 'Generate scripts'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
