# AI Instagram Reel Generator

An end-to-end Node.js pipeline that turns a plain-text video script into a polished, vertical Instagram Reel using generative AI for storyboarding, image generation, motion synthesis, and ffmpeg-based video stitching.

## What It Does

Given a 30-second ad script (e.g. `script.md`), the pipeline automatically:

1. **Breaks the script into storyboard frames** — Uses an LLM to generate 5 detailed visual prompts.
2. **Generates 5 storyboard images** — Calls Kie AI's `qwen/text-to-image` (first frame) and `qwen/image-to-image` (subsequent frames) to produce a consistent vertical 9:16 image sequence.
3. **Generates motion prompts** — Uses an LLM to write 5 animation prompts tailored to each storyboard image.
4. **Creates 5 video clips** — Submits image-to-video jobs to Kie AI's `bytedance/seedance-2-fast` model (~5 s per clip).
5. **Stitches everything together** — Normalizes all clips to **1080×1920, 30 fps, H.264/AAC** with `fluent-ffmpeg` and concatenates them into a single `final-reel.mp4`.
6. **Uploads the final reel** *(optional)* — Pushes the result to Kie AI's file server for a shareable public URL.

The example `script.md` provided is a 30-second claymation-style ad for **The Whole Truth** protein bars.

## Tech Stack

| Layer | Tool / Service |
|-------|----------------|
| LLM Orchestration | `@ai-sdk/openai-compatible` + `ai` SDK |
| Image Generation | Kie AI — `qwen/text-to-image` & `qwen/image-to-image` |
| Video Generation | Kie AI — `bytedance/seedance-2-fast` (image-to-video) |
| Video Processing | `fluent-ffmpeg` (normalize + concat) |
| File Uploads | Kie AI file-stream upload API |
| State Management | Local `state.json` (caches URLs & paths for resumability) |

## Project Structure

```
├── src/
│   ├── pipeline.js              # Main orchestrator — runs the full 4-step pipeline
│   ├── functions/
│   │   ├── breakdown.js         # Step 1: Script → visual prompts → 5 storyboard images
│   │   ├── videoGen.js          # Step 2: Storyboard images → motion prompts → 5 video clips
│   │   └── stitch.js            # Step 3: Normalize & concatenate clips with ffmpeg
│   └── utils/
│       ├── generatePrompts.js   # LLM helpers (visual & motion prompt generation)
│       ├── kieFileUpload.js     # Upload images/videos to Kie AI file server
│       ├── pollKieJob.js        # Poll Kie AI async jobs until completion
│       ├── downloadAsset.js     # Download remote assets locally
│       └── saveState.js         # Read/write state.json cache
├── index.js                     # Minimal "Hello World" LLM sanity check
├── run-pipeline-manual.js       # Manual pipeline: skip LLM prompts, use existing images + hardcoded motion prompts
├── generate-images-only.js      # Run only Step 1 (storyboard images)
├── test-stitch.js               # Test ffmpeg stitching with cached clips
├── script.md                    # Example 30-second ad script
├── state.json                   # Pipeline cache (image URLs, video URLs, paths)
├── output/
│   ├── images/frame-{1..5}.png  # Generated storyboard frames
│   ├── videos/clip-{1..5}.mp4   # Generated video clips
│   └── final-reel.mp4           # Final stitched Instagram Reel
├── package.json
└── .env / env-local             # Environment variables (not committed)
```

## Environment Variables

Create a `.env` file (or `env-local`) in the project root:

```bash
# Kie AI (image & video generation + file uploads)
KIE_AI_API_KEY=your_kie_ai_key
KIE_AI_BASE_URL=https://api.kie.ai        # optional; defaults to https://api.kie.ai

# OpenAI-compatible LLM (prompt generation)
OPENAI_COMPATIBLE_API_KEY=your_llm_key
OPENAI_COMPATIBLE_BASE_URL=https://api.openai.com/v1
OPENAI_COMPATIBLE_MODEL=gpt-4o-mini
```

## Usage

### 1. Run the full automated pipeline

```bash
node src/pipeline.js "Your 30-second Instagram Reel script..."
```

Or import it programmatically:

```js
const { runReelPipeline } = require('./src/pipeline');
const script = require('fs').readFileSync('./script.md', 'utf8');

runReelPipeline(script, './output/my-reel.mp4')
  .then(url => console.log('Done:', url));
```

### 2. Generate storyboard images only

```bash
node generate-images-only.js
```

### 3. Run the manual pipeline (skip LLM, use existing images)

Useful when you already have the 5 storyboard images in `output/images/` and want to supply your own motion prompts:

```bash
node run-pipeline-manual.js
```

### 4. Test ffmpeg stitching

```bash
node test-stitch.js
```

### 5. Quick LLM sanity check

```bash
node index.js
```

## Pipeline Details

| Step | Input | Output | AI Model |
|------|-------|--------|----------|
| 1. Storyboard | `script.md` | `output/images/frame-1..5.png` | LLM → `qwen/text-to-image` + `qwen/image-to-image` |
| 2. Video Clips | 5 image URLs | `output/videos/clip-1..5.mp4` | LLM → `bytedance/seedance-2-fast` |
| 3. Stitch | 5 video URLs | `output/final-reel.mp4` | `fluent-ffmpeg` (libx264 / AAC) |
| 4. Upload | `final-reel.mp4` | Public URL | Kie AI file server |

### Style Consistency Trick
Frame 1 is generated from scratch via text-to-image. Frames 2–5 are generated via image-to-image using the **previous frame** as a reference (`strength: 0.8`), ensuring characters, colors, and art style stay consistent across the storyboard.

## Resumability

The pipeline writes intermediate results to `state.json`. If a step succeeds, rerunning the pipeline will skip it automatically (unless you set `skipIfCached = false`).

## Example Output

Based on the included `script.md`, the pipeline produces a 25-second claymation-style Instagram Reel with five scenes:

1. A gym-goer inspects a generic protein bar; ingredients morph into a gooey monster.
2. The monster pokes the gym-goer, who bloats like a clay balloon.
3. A giant hand swats the monster away; a "The Whole Truth" bar drops in.
4. Ingredients pop out and do a victory dance, then smash into a fresh bar.
5. The gym-goer takes a bite, deflates back to normal, and flexes.

## Dependencies

- `ai` & `@ai-sdk/openai-compatible` — LLM inference
- `fluent-ffmpeg` — Video transcoding & concatenation
- `fs-extra` — Enhanced filesystem utilities
- `dotenv` — Environment variable loading
- `form-data` — Multipart uploads

Requires **ffmpeg** installed on your system and accessible in `$PATH`.
