import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type Message = {
  id: number
  name: string
  content: string
  created_at: string
}

const getApiBase = () => {
  const value = import.meta.env.VITE_EDGE_API_URL?.trim()
  if (!value) {
    return ''
  }

  return value.endsWith('/') ? value.slice(0, -1) : value
}

function App() {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusText, setStatusText] = useState('Ready')
  const [errorText, setErrorText] = useState('')
  const apiBase = useMemo(() => getApiBase(), [])

  const loadMessages = async () => {
    setIsLoading(true)
    setErrorText('')
    setStatusText('Loading messages from Supabase...')

    try {
      const response = await fetch(`${apiBase}/api/messages`)
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const payload = (await response.json()) as { messages: Message[] }
      setMessages(payload.messages ?? [])
      setStatusText('Messages synced from Supabase through the Edge Function.')
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Could not load messages from the API.'
      )
      setStatusText('Edge function request failed.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadMessages()
    // We intentionally run this once on page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorText('')
    setStatusText('Saving message...')

    try {
      const response = await fetch(`${apiBase}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          content,
        }),
      })

      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`)
      }

      const payload = (await response.json()) as { message: Message }
      const nextMessage = payload.message
      if (nextMessage) {
        setMessages((previous) => [nextMessage, ...previous])
      }

      setStatusText('Message saved in Supabase via Vercel Edge.')
      setContent('')
    } catch (error) {
      setErrorText(
        error instanceof Error
          ? error.message
          : 'Could not save your message. Check env vars.'
      )
      setStatusText('Insert failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 p-6 md:p-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Vite + shadcn/ui + Supabase + Vercel Edge</CardTitle>
          <CardDescription>
            This example writes and reads from Supabase through a Vercel Edge Function.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Frontend: Vite + React</Badge>
          <Badge variant="outline">UI: shadcn/ui</Badge>
          <Badge variant="outline">DB: Supabase</Badge>
          <Badge>API: /api/messages (Edge)</Badge>
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">{statusText}</CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create message</CardTitle>
          <CardDescription>
            Submitting this form calls your Edge Function, which inserts a row in Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Vaibhav"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Message</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Hello from the production demo"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save in Supabase'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadMessages()}
                disabled={isLoading}
              >
                {isLoading ? 'Refreshing...' : 'Refresh list'}
              </Button>
            </div>
            {errorText ? (
              <p className="text-sm text-destructive">
                Error: {errorText}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
          <CardDescription>Loaded from Supabase using your Vercel Edge API route.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Message</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {messages.length ? (
                messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-medium">{message.name}</TableCell>
                    <TableCell>{message.content}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {new Date(message.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={3}>
                    No messages yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  )
}

export default App
