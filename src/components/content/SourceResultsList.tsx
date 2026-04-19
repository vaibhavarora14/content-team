import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DerivedQuery, SourceResult } from './types'

type SourceResultsListProps = {
  derivedQueries: DerivedQuery[]
  results: SourceResult[]
  onScrapeTop: () => void
  isScraping: boolean
}

export function SourceResultsList(props: SourceResultsListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>2) Derived queries and search results</CardTitle>
        <CardDescription>
          Queries are generated from your brand brief and used to fetch live web results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {props.derivedQueries.length ? (
            props.derivedQueries.map((item) => (
              <Badge key={`${item.query}-${item.intent}`} variant="outline">
                {item.query} ({item.intent})
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No derived queries yet.</p>
          )}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={props.onScrapeTop}
            disabled={!props.results.length || props.isScraping}
          >
            {props.isScraping ? 'Scraping...' : 'Scrape top links'}
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Query</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>URL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.results.length ? (
              props.results.map((result, index) => (
                <TableRow key={`${result.query}-${result.url}-${index}`}>
                  <TableCell>{result.rank}</TableCell>
                  <TableCell>{result.query}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal">{result.title}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    <a className="underline" href={result.url} rel="noreferrer" target="_blank">
                      {result.url}
                    </a>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={4}>
                  Search results will appear here.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
