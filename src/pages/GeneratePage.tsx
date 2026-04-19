import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { KeywordSearchForm } from '@/components/content/KeywordSearchForm'
import { RunStepsPanel } from '@/components/content/RunStepsPanel'
import { ScriptResultsPanel } from '@/components/content/ScriptResultsPanel'
import type { VideoScript } from '@/components/content/types'
import { getApiBase } from '@/lib/api-base'
import type { RunStepKey, RunStepState } from '@/components/content/RunStepsPanel'

const BRAND_BRIEF_EXAMPLE = `The Whole Truth (TWT) is an Indian clean-label health food brand built on the foundational premise of absolute transparency. Founded by Shashank Mehta, the brand was born out of frustration with the deceptive marketing and hidden ingredients prevalent in the FMCG and "health food" industries.
Mission: To rebuild the world's trust in its food.
Core Promise: 100% clean ingredients. No hidden sugars, no artificial sweeteners, no chemical preservatives, and no unpronounceable jargon. What is on the front of the pack is exactly what is inside.
Target Audience
Demographic: Urban millennials and Gen Z (18-40 years old), primarily in Tier-1 and Tier-2 cities in India.
Psychographic: Health-conscious individuals, fitness enthusiasts, label-readers, and educated consumers who are skeptical of big food corporations. They value authenticity, health, and clean eating without compromising on taste.
The Problem They Face: They want high-protein snacks for fitness and satiety, but traditional protein bars are loaded with sugar alcohols (like maltitol), artificial flavors, cheap protein isolates, and syrups that cause bloating and sugar spikes.

Product Focus: Protein Bars
The protein bar category is TWT's flagship offering and the perfect embodiment of their brand philosophy. TWT disrupted the Indian protein bar market by challenging the standard manufacturing process.
1. The "Front of Pack" Declaration TWT protein bars famously feature all their ingredients in large, bold font right on the front of the packaging. If a bar has five ingredients, all five are listed front and center (e.g., Dates, Whey, Cashews, Almonds, Cocoa).
2. Product USPs & Ingredient Philosophy
No Added Sugar or Sweeteners: They use absolutely zero added sugar, artificial sweeteners (like sucralose), or sugar alcohols (like maltitol or erythritol).
Naturally Bound: Instead of using liquid glucose or prebiotic fibers (IMO syrups) to bind the bar together, TWT uses dates.
Quality Protein: They use premium Whey Protein Concentrate/Isolate rather than cheap soy protein nuggets or gluten-based fillers.
No Artificial Flavors/Colors: They rely on real cocoa, real berries, and real nuts for flavor and texture.
3. The Taste and Texture Profile Because they are made with real food (dates, nuts, whey), the texture is denser and chewier, reminiscent of a brownie or fudge, rather than the synthetic, chalky, or overly chewy texture of heavily processed bars.

Brand Voice & Personality
Honest & Transparent: The brand never relies on fine print. If a bar has high calories because of nuts, they own it.
Witty & Educational: TWT doesn't just sell food; they educate consumers. They use humor and satire to expose industry loopholes (e.g., how brands hide sugar under 50 different names).
Rebellious but Relatable: They position themselves as the "David" fighting the "Goliath" of big food/pharma, but they do it with a smile and a meme rather than angry corporate rhetoric.
Conversational: Their packaging, website, and social media copy read like a text from a smart, health-obsessed friend.
Competitive Landscape
Direct Competitors: Yoga Bar, RiteBite Max Protein, Phab, MuscleBlaze (in the protein snack space).
TWT's Positioning: While competitors often compete on "highest protein per gram" or "lowest calories," TWT competes purely on ingredient quality and gut health. They charge a premium for the fact that their bars are essentially real food compressed into a bar, appealing to those who prioritize clean digestion over just hitting a macro target.
Marketing & Visual Identity
Packaging: Minimalist, bold, and typography-driven. The ingredient list is the hero image. It stands out on crowded retail shelves full of flashy, heavily styled graphics.
Content Strategy: Highly engaging social media presence, heavily reliant on short-form video (Reels/Shorts) where the founder or team breaks down food science, decodes competitor labels, and explains nutrition in layman's terms.
Community: They foster a cult-like following through a strong newsletter ("Truth Be Told") and active engagement with their customer base, building immense brand loyalty.`

const createInitialSteps = (): RunStepState[] => [
  { key: 'search', label: 'Search web sources', status: 'pending' },
  { key: 'scrape', label: 'Scrape top links', status: 'pending' },
  { key: 'topics', label: 'Extract topic angles', status: 'pending' },
  { key: 'scripts', label: 'Generate scripts', status: 'pending' },
  { key: 'enrich', label: 'Generate video and Twitter posts', status: 'pending' },
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type EnrichmentPayload = {
  twitterPosts?: Array<{ scriptId: string; text: string }>
  firstScriptVideo?: {
    status: 'queued' | 'processing' | 'completed' | 'failed'
    jobId?: string
    publicUrl?: string
    error?: string
  }
  warnings?: string[]
  warning?: string
  error?: string
}

export function GeneratePage() {
  const [brandBrief, setBrandBrief] = useState('')
  const [scripts, setScripts] = useState<VideoScript[]>([])
  const [runId, setRunId] = useState('')
  const [steps, setSteps] = useState<RunStepState[]>(createInitialSteps)
  const [isStepsExpanded, setIsStepsExpanded] = useState(true)
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false)
  const [statusText, setStatusText] = useState('Ready')
  const [errorText, setErrorText] = useState('')
  const apiBase = useMemo(() => getApiBase(), [])
  const hasRunActivity =
    isGeneratingFlow || runId.length > 0 || steps.some((step) => step.status !== 'pending')

  const setStepStatus = (key: RunStepKey, status: RunStepState['status']) => {
    setSteps((previous) =>
      previous.map((step) => {
        if (step.key === key) {
          return { ...step, status }
        }
        return step
      })
    )
  }

  const mergeEnrichment = (
    generatedScripts: VideoScript[],
    enrichment: EnrichmentPayload
  ) => {
    const twitterByScriptId = new Map(
      (enrichment.twitterPosts ?? []).map((post) => [post.scriptId, post.text])
    )

    return generatedScripts.map((script, index) => {
      if (index !== 0) {
        const nextTwitter = twitterByScriptId.get(script.id)
        return {
          ...script,
          twitterPost: nextTwitter ?? script.twitterPost,
        }
      }

      const nextTwitter = twitterByScriptId.get(script.id)
      return {
        ...script,
        twitterPost: nextTwitter ?? script.twitterPost,
        videoStatus: enrichment.firstScriptVideo?.status ?? script.videoStatus,
        videoJobId: enrichment.firstScriptVideo?.jobId ?? script.videoJobId,
        videoUrl: enrichment.firstScriptVideo?.publicUrl ?? script.videoUrl,
        videoError: enrichment.firstScriptVideo?.error ?? script.videoError,
      }
    })
  }

  const runGenerationFlow = async (nextBrandBrief: string) => {
    setIsGeneratingFlow(true)
    setErrorText('')
    setScripts([])
    setRunId('')
    setSteps(createInitialSteps())
    setIsStepsExpanded(true)

    type FlowStage = 'search' | 'scrape' | 'topics' | 'scripts' | 'enrich'
    let stage: FlowStage = 'search'

    try {
      setStepStatus('search', 'in_progress')
      setStatusText('Searching subjects and gathering web results...')
      const searchResponse = await fetch(`${apiBase}/api/research/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brandBrief: nextBrandBrief,
          topN: 10,
        }),
      })
      if (!searchResponse.ok) {
        throw new Error(`Request failed with ${searchResponse.status}`)
      }

      const searchPayload = (await searchResponse.json()) as { run: { id: string } }
      const nextRunId = searchPayload.run.id
      setRunId(nextRunId)
      setStepStatus('search', 'completed')

      stage = 'scrape'
      setStepStatus('scrape', 'in_progress')
      setStatusText('Reading top source pages...')
      const scrapeResponse = await fetch(`${apiBase}/api/research/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId: nextRunId,
          maxUrls: 5,
        }),
      })
      if (!scrapeResponse.ok) {
        throw new Error(`Request failed with ${scrapeResponse.status}`)
      }
      setStepStatus('scrape', 'completed')

      stage = 'topics'
      setStepStatus('topics', 'in_progress')
      setStatusText('Extracting high-signal topics...')
      const topicsResponse = await fetch(`${apiBase}/api/topics/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ runId: nextRunId }),
      })
      if (!topicsResponse.ok) {
        throw new Error(`Request failed with ${topicsResponse.status}`)
      }
      setStepStatus('topics', 'completed')

      const topicsPayload = (await topicsResponse.json()) as { topics: Array<{ id: string }> }
      const topicIds = (topicsPayload.topics ?? []).slice(0, 5).map((topic) => topic.id)

      stage = 'scripts'
      setStepStatus('scripts', 'in_progress')
      setStatusText('Generating final scripts...')
      const scriptsResponse = await fetch(`${apiBase}/api/scripts/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId: nextRunId,
          topicIds: topicIds.length ? topicIds : undefined,
          count: 5,
        }),
      })
      if (!scriptsResponse.ok) {
        throw new Error(`Request failed with ${scriptsResponse.status}`)
      }

      const scriptsPayload = (await scriptsResponse.json()) as { scripts: VideoScript[] }
      const generatedScripts = scriptsPayload.scripts ?? []
      setScripts(generatedScripts)
      setStepStatus('scripts', 'completed')

      stage = 'enrich'
      setStepStatus('enrich', 'in_progress')
      setStatusText('Generating Twitter posts and video from script #1...')

      const enrichResponse = await fetch(`${apiBase}/api/scripts/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runId: nextRunId,
          scripts: generatedScripts,
        }),
      })

      if (!enrichResponse.ok) {
        throw new Error(`Request failed with ${enrichResponse.status}`)
      }

      const enrichPayload = (await enrichResponse.json()) as EnrichmentPayload
      const enrichedScripts = mergeEnrichment(generatedScripts, enrichPayload)
      setScripts(enrichedScripts)

      if (enrichPayload.warnings?.length || enrichPayload.warning) {
        setErrorText(
          [
            ...(enrichPayload.warnings ?? []),
            ...(enrichPayload.warning ? [enrichPayload.warning] : []),
          ].join(' ')
        )
      }

      let finalVideoStatus = enrichPayload.firstScriptVideo?.status
      if (finalVideoStatus === 'failed') {
        setStepStatus('enrich', 'failed')
        setStatusText('Twitter posts generated, but video generation failed.')
      } else {
        setStatusText('Twitter posts generated. Video job queued, waiting for updates...')
        let statusPollFailures = 0
        let successfulStatusPolls = 0

        for (let attempt = 1; attempt <= 40; attempt++) {
          await sleep(4000)

          const statusResponse = await fetch(
            `${apiBase}/api/scripts/enrich-status?runId=${encodeURIComponent(nextRunId)}`
          )
          if (!statusResponse.ok) {
            statusPollFailures += 1
            setStatusText(
              `Waiting for video updates... (status poll failed: ${statusResponse.status})`
            )
            if (statusPollFailures >= 5) {
              setStepStatus('enrich', 'failed')
              setErrorText(
                'Could not fetch enrichment status repeatedly. Please refresh Runs to retry.'
              )
              break
            }
            continue
          }

          const statusPayload = (await statusResponse.json()) as EnrichmentPayload
          statusPollFailures = 0
          successfulStatusPolls += 1
          setScripts((previous) => mergeEnrichment(previous, statusPayload))
          finalVideoStatus = statusPayload.firstScriptVideo?.status

          if (finalVideoStatus === 'completed') {
            setStepStatus('enrich', 'completed')
            setStatusText(
              `Scripts generated (${generatedScripts.length}) with video + Twitter posts.`
            )
            break
          }

          if (finalVideoStatus === 'failed') {
            setStepStatus('enrich', 'failed')
            setStatusText('Twitter posts generated, but video generation failed.')
            break
          }

          setStatusText(`Twitter posts ready. Video is ${finalVideoStatus ?? 'queued'}...`)
        }

        if (finalVideoStatus !== 'completed' && finalVideoStatus !== 'failed') {
          setStepStatus('enrich', 'failed')
          if (!successfulStatusPolls) {
            setErrorText('Unable to retrieve enrichment status from the server.')
            setStatusText('Twitter/video status could not be confirmed. Please check Runs and retry.')
          } else {
            setStatusText('Video status did not finish in time. Refresh Runs later for the final link.')
          }
        }
      }
    } catch (error) {
      const stageLabel =
        stage === 'search'
          ? 'subject search'
          : stage === 'scrape'
            ? 'source scraping'
            : stage === 'topics'
              ? 'topic extraction'
              : stage === 'scripts'
                ? 'script generation'
                : 'enrichment'

      setStepStatus(stage, 'failed')
      setErrorText(error instanceof Error ? error.message : `Failed during ${stageLabel}.`)
      setStatusText(`Failed during ${stageLabel}.`)
    } finally {
      setIsGeneratingFlow(false)
    }
  }

  const onSubmitBrief = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await runGenerationFlow(brandBrief)
  }

  const onUseExampleBrief = () => {
    setBrandBrief(BRAND_BRIEF_EXAMPLE)
    void runGenerationFlow(BRAND_BRIEF_EXAMPLE)
  }

  return (
    <>
      <KeywordSearchForm
        brandBrief={brandBrief}
        isSubmitting={isGeneratingFlow}
        onBrandBriefChange={setBrandBrief}
        onSubmit={(event) => void onSubmitBrief(event)}
        onUseExampleBrief={onUseExampleBrief}
      />

      {hasRunActivity ? (
        <>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{statusText}</p>
            {errorText ? <p className="text-destructive">Error: {errorText}</p> : null}
          </div>

          <RunStepsPanel
            isExpanded={isStepsExpanded}
            onToggleExpanded={() => setIsStepsExpanded((previous) => !previous)}
            runId={runId || undefined}
            steps={steps}
          />
        </>
      ) : null}

      <ScriptResultsPanel scripts={scripts} />
    </>
  )
}
