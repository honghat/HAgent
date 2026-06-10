---
name: video-generation
description: Use this skill when the user requests to generate, create, or imagine videos. Supports structured prompts and reference image for guided generation.
---

# Video Generation Skill

## Overview

This skill generates high-quality videos using structured prompts and a Python script. The workflow includes creating JSON-formatted prompts and executing video generation with optional reference image.

## Core Capabilities

- Create structured JSON prompts for AIGC video generation
- Support reference image as guidance or the first/last frame of the video
- Generate videos through automated Python script execution

## Workflow

### Step 1: Understand Requirements

When a user requests video generation, identify:

- Subject/content: What should be in the image
- Style preferences: Art style, mood, color palette
- Technical specs: Aspect ratio, composition, lighting
- Reference image: Any image to guide generation
- You don't need to check the folder under `/mnt/user-data`

### Step 2: Create Structured Prompt

Generate a structured JSON file in `workspace/` with naming pattern: `{descriptive-name}.json`

### Step 3: Create Reference Image (Optional when image-generation skill is available)

Generate reference image for the video generation.

- If only 1 image is provided, use it as the guided frame of the video

### Step 3: Execute Generation

Call the Python script:
```bash
python backend/agent/app/skills/hagent/video-generation/scripts/generate.py \
  --prompt-file workspace/prompt-file.json \
  --reference-images /path/to/ref1.jpg \
  --output-file workspace/outputs/generated-video.mp4 \
  --aspect-ratio 16:9
```

Parameters:

- `--prompt-file`: Absolute path to JSON prompt file (required)
- `--reference-images`: Absolute paths to reference image (optional)
- `--output-file`: Absolute path to output image file (required)
- `--aspect-ratio`: Aspect ratio of the generated image (optional, default: 16:9)

[!NOTE]
Do NOT read the python file, instead just call it with the parameters.

## Video Generation Example

User request: "Generate a short video clip depicting the opening scene from "The Chronicles of Narnia: The Lion, the Witch and the Wardrobe"

Step 1: Search for the opening scene of "The Chronicles of Narnia: The Lion, the Witch and the Wardrobe" online

Step 2: Create a JSON prompt file with the following content:

```json
{
  "title": "The Chronicles of Narnia - Train Station Farewell",
  "background": {
    "description": "World War II evacuation scene at a crowded London train station. Steam and smoke fill the air as children are being sent to the countryside to escape the Blitz.",
    "era": "1940s wartime Britain",
    "location": "London railway station platform"
  },
  "characters": ["Mrs. Pevensie", "Lucy Pevensie"],
  "camera": {
    "type": "Close-up two-shot",
    "movement": "Static with subtle handheld movement",
    "angle": "Profile view, intimate framing",
    "focus": "Both faces in focus, background soft bokeh"
  },
  "dialogue": [
    {
      "character": "Mrs. Pevensie",
      "text": "You must be brave for me, darling. I'll come for you... I promise."
    },
    {
      "character": "Lucy Pevensie",
      "text": "I will be, mother. I promise."
    }
  ],
  "audio": [
    {
      "type": "Train whistle blows (signaling departure)",
      "volume": 1
    },
    {
      "type": "Strings swell emotionally, then fade",
      "volume": 0.5
    },
    {
      "type": "Ambient sound of the train station",
      "volume": 0.5
    }
  ]
}
```

Step 3: Use the image-generation skill to generate the reference image

Load the image-generation skill and generate a single reference image `narnia-farewell-scene-01.jpg` according to the skill.

Step 4: Use the generate.py script to generate the video
```bash
python backend/agent/app/skills/hagent/video-generation/scripts/generate.py \
  --prompt-file workspace/narnia-farewell-scene.json \
  --reference-images workspace/outputs/narnia-farewell-scene-01.jpg \
  --output-file workspace/outputs/narnia-farewell-scene-01.mp4 \
  --aspect-ratio 16:9
```
> Do NOT read the python file, just call it with the parameters.

## ✅ GSAP Full Animation Pipeline (DEFAULT)

**When user requests video generation, default to full animation compose pipeline:**

1. **gsap-animation-only** (--gsap-fps 24): Creates scene metadata in `_gsap_scenes.json`
   - Each scene MUST include: `scene_number`, `subtitle`, `duration_seconds`, `scene_description`, `camera_move`, `animation_hint`
   - Scene number (not "scene") is critical for proper sequencing
2. **tts-only** (--delay 2.5): Generates audio with 2.5s delay between scenes
3. **gsap-compose-only**: Encodes frame sequences per scene → MP4 clips via ffmpeg

```bash
python scripts/video_creator.py \\\n  --mode gsap-animation-only \\\n  --prompt-file workspace/scenes.json \\\n  --output-dir workspace/outputs
```

**Then run tts and compose:**

```bash
python scripts/video_creator.py \\\n  --mode tts-only \\\n  --audio-dir workspace/outputs/audio
\n\npython scripts/video_creator.py \\\n  --mode gsap-compose-only \\\n  --gsap-fps 24 \\\n  --input-dir workspace/outputs/gsap \\\n  --output-workspace workspace/outputs/compose
```

**Landscape video fix (critical for MP4):**  
If scenes output portrait (1080x1920), create a separate moviepy script (`build_landscape.py`) to:
- Resize/crop to landscape 1536x1024 using `ImageClip.resize` + cropped
- Add subtitle via `TextClip fontsize=28`
- Background bar via `ColorClip`
- Pan/zoom via `vfx.Resize`
- FadeIn/FadeOut effects

```bash
python build_landscape.py --input workspace/outputs/compose \\\n  --output outputs/final-video.mp4 \\\n  --bgm workspace/music/background.mp3
```

**Output:** Landscape MP4 (1536x1024) with proper subtitles and BGM.

## ⚙️ Standalone Video Script Pattern (NO AI API)

When user requests a simple video clip:

1. **Write the script yourself** — don't call AI APIs
   - Use `scene_number` (NOT `scene`) for all GSAP scenes
   - Include ALL fields: `subtitle`, `duration_seconds`, `scene_description`, `camera_move`, `animation_hint`
   
2. **Example scene JSON:**
   ```json
   {
     "scenes": [
       {
         "scene_number": 1,
         "subtitle": "Xin chào mọi người",
         "duration_seconds": 3,
         "scene_description": "Chữ hello xuất hiện từ dưới lên",
         "camera_move": "none",
         "animation_hint": "fade_in_0.5"
       }
     ]
   }
   ```

3. **Pipeline execution:**
   ```bash
   # Step 1: Create scenes metadata
   python scripts/video_creator.py --mode gsap-animation-only \\\n     --prompt-file workspace/my-video.json \\\n     --output-dir workspace/outputs
   
   # Step 2: Generate audio (2.5s delay between scenes)
   python scripts/video_creator.py --mode tts-only \\\n     --audio-dir workspace/outputs/audio
   
   # Step 3: Compose full animation
   python scripts/video_creator.py --mode gsap-compose-only \\\n     --gsap-fps 24 \\\n     --input-dir workspace/outputs/gsap \\\n     --output-workspace workspace/outputs/compose
   ```

## Output Handling

After generation:

- Videos are typically saved in `workspace/outputs/compose/` or final output path
- Share generated videos (come first) with user as well as generated image if applicable, using `present_files` tool
- Provide brief description of the generation result
- Offer to iterate if adjustments needed

## Notes

- Always use English for prompts regardless of user's language
- JSON format ensures structured, parsable prompts
- **Scene numbering is CRITICAL** — GSAP requires sequential integers starting from 1
- Default pipeline: gsap-animation-only → tts-only (2.5s delay) → gsap-compose-only

## References

- Full animation compose pattern → See full pipeline details in main skill body above
- Landscape video fix: `references/landscape-video-moviepy-fix.md` (script for portrait→landscape conversion)
- You can also use ComfyUI with SDXL-Lightning GGUF (running on hat-linux port 8188) for higher quality reference images — see `comfyui` skill or `video-pipeline-ui` skill for API details
- All ComfyUI/GGUF integration details are in the `comfyui` skill's `references/remote-ssh-setup.md`
- Iterative refinement is normal for optimal results

## Canvas Enhancement Pattern (PDF Viewer Example)

When enhancing canvas-based viewers (e.g., PDF with pdfjs-dist), use these techniques:

### Auto-page-turn on Mouse Wheel

1. Add event listener to container/canvas element:
```jsx
<div 
  className="canvas-container" 
  onMouseWheel={handleMouseWheel}
/>

const handleMouseWheel = useCallback((e) => {
  const wheelSpeed = -1 * e.deltaY * 0.5; // Normalize scroll speed
  const newIdx = Math.min(
    Math.max(activeIdx + wheelSpeed, 0),
    pages.length - 1
  );
  if (newIdx !== activeIdx) {
    setActiveIdx(newIdx);
    // Render the page with pdfjsLib
  }
}, [activeIdx, pages]);
```

2. Calculate scroll speed from deltaY:
   - Positive deltaY = scroll down (next page)
   - Negative deltaY = scroll up (previous page)
   - Multiply by 0.5 for finer control

### Display "Trang X / Y" at Corner

```jsx
<div className="text-[10px] text-gray-500">
  {pages.length} trang · Trang {activeIdx + 1} / {totalPages}
</div>
```

**Key considerations:**
- Use `useCallback` for event handlers to prevent re-render issues
- Validate page bounds before navigation
- Store page state in React state or IndexedDB for persistence
- Canvas-based renderers need explicit scroll listeners (unlike scrollable containers)

## Related Patterns & References

- See `tool-usage-patterns` skill for complete tool failure fallback strategies and anti-patterns
- See `tool-usage-patterns/references/canvas-enhancement-patterns.md` for detailed canvas enhancement examples
