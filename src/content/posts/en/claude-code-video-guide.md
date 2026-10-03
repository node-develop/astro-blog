---
title: "Video with Claude Code: from brief to reproducible render"
description: "Build a video workflow with Claude Code, Canvas, Playwright and FFmpeg: engine choice, briefs, timing, motion, audio, verification and multiple delivery formats."
summary: "Claude Code can help write scenes and rendering tools. This guide builds a first MP4 with Canvas, Playwright and FFmpeg, then adds a brief, controlled motion, audio and verification. Remotion and HyperFrames are covered as separate routes."
pubDate: 2026-10-02
tags:
  - claude-code
  - motion-design
  - javascript
  - video
keywords:
  - video with Claude Code
  - motion graphics
  - Canvas Playwright FFmpeg
  - Remotion
  - HyperFrames
lang: en
draft: false
manuallyEdited: true
sourceHash: 6f412ea43d3de2a0514d27fcb26481cf0f3eae6f04e7cf0dad885c40caa5aadb
---

Claude Code can help turn a script into a working video project: write scenes, set up export and revise a transition. In this guide, Canvas draws the frames, Playwright captures them as PNGs and FFmpeg encodes the MP4. Repeatable output depends on fixed inputs and a frame function driven by explicit time. Start with a short scene, check the complete path to a playable file, then develop the motion and sound.

You should be comfortable running Node.js, reading JavaScript and using Git. Both source files are included below, so the exercise needs no private download or paid video generator. The first pass produces a technical baseline. From there, the guide covers a production brief, visual direction, timing, sound and review. Remotion, HyperFrames, generated footage and interactive explanations have separate sections; none is an additional dependency for the Canvas exercise.

The teaching example is Patchwork, a fictional release-preparation tool. Changes become groups, pass through review and turn into a finished package. These four states give us a story to animate without making claims about a real product.

## What Claude Code does in a video project

A code-based video project can separate content, design, timing and infrastructure. Content determines what the viewer should understand. Design defines objects, typography and visual hierarchy. The timeline connects changes to time. Infrastructure loads files, captures images and encodes them into video.

Claude Code helps modify these parts through files and tools. The model does not replace a video codec, and generating code does not by itself make a composition good. Correcting a spelling mistake, finding an unloaded font and choosing an expressive pause require different checks. The relationship between the agent and its tools is covered in the [introduction to Claude Code](/en/courses/claude-code-guide/01-introduction/).

Programmatic video makes it possible to separate data from the scene. An approved template can then accept another heading, language or set of numbers. Reuse becomes useful after the template itself has been checked. If the first version has unreadable text, automatically producing twenty variants will repeat the same defect.

The exercise lasts sixteen seconds at 30 fps: 480 frames. Four four-second states leave room for an entrance, an action, reading time and a scene change. The minimal code implements simple entrances and switches; the expressive transitions are design work for a later pass. The duration keeps the complete test cycle manageable. It is not a prescription for an effective advertisement.

## Choose one engine

The material and your preferred way of building scenes should guide the choice. Installing several systems at once makes diagnosis harder: each has its own time model, asset loader and export path.

| Route                        | Suitable material                                        | Time model                                      | What you still maintain                                 |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Canvas + Playwright + FFmpeg | Geometry, typography, diagrams, a small custom renderer  | An explicit frame function of seconds           | Loading, text layout, capture, checks and export        |
| Remotion                     | React components, interface scenes, data-driven variants | Frame numbers and composition APIs              | Design, data, resources, quality and delivery settings  |
| HyperFrames                  | HTML/CSS scenes and GSAP                                 | A composition contract and controlled timelines | The engine’s runtime contract, inputs and visual review |
| Editing existing clips       | Interviews, walkthroughs, filmed products                | The editor's timeline                           | Accurate cuts, sound, subtitles and source quality      |

Canvas has no built-in editing timeline. Its advantage for this exercise is that the path from time to pixels is visible, and a minimal scene fits in one file. When a video contains many interface components, a React project may be easier to maintain in Remotion. Its current setup and constraints are described in the [official documentation](https://www.remotion.dev/docs/).

[HyperFrames](https://github.com/heygen-com/hyperframes) supplies its own HTML-video workflow and CLI. Its compositions follow a specific runtime contract; it cannot simply wrap any page that exposes `window.seek`. Separate setup commands for both alternatives appear later. Neither is required for the Canvas example.

For illustrated characters, you can also examine [claude-animation-skill](https://github.com/buildwithhanif/claude-animation-skill), a third-party project using Node Canvas and its own animation rules. It is an alternative implementation to study, not a required dependency. Read its code and license before running it. A public repository and a familiar hosting platform do not establish installation safety or rights to every included media asset.

## Prepare the environment and project boundaries

The main route needs Node.js, FFmpeg, Python for a local HTTP server and the Chromium version installed through Playwright. Python does not generate anything or call a model in this example. The scene uses ordinary Canvas 2D, without WebGL or external images.

On a Mac with Homebrew already installed, you can start with:

```bash
brew install --cask claude-code
brew install node@24 ffmpeg python@3.12
export PATH="$(brew --prefix node@24)/bin:$PATH"

claude --version
claude doctor
node --version
npm --version
ffmpeg -version
ffprobe -version
python3.12 --version
```

Node 24 and Python 3.12 provide a concrete starting point. If your environment is already set up, check the installed tools and their versions before reinstalling anything. Homebrew’s `node@24` needs its binary directory added to PATH; the `export` above affects the current terminal. Check `node --version` again in a new terminal. Avoid changing global settings by trial and error midway through the project.

Check sign-in and model access in the [Claude Code documentation](https://code.claude.com/docs/en/setup). Subscription access and API billing have different terms; free chat access does not establish CLI access. An existing `ANTHROPIC_API_KEY` can also affect how the session is billed. Keep credentials out of browser code, screenshots, prompt logs and delivery archives.

Run the agent from a separate directory containing the required materials. For the first pass:

```bash
claude --model opus --effort medium
```

The `opus` alias selects an available current model in that family, so record the actual model from the session if you need a reproducible report. Check `/model` and `/status`. More reasoning effort may help with a difficult problem, but it does not replace a storyboard or watching the result. Available settings depend on the CLI version and account; consult the [model configuration reference](https://code.claude.com/docs/en/model-config).

Do not disable permissions to get through the first render. A project folder and a `CLAUDE.md` instruction do not create an operating-system sandbox. Real restrictions come from the environment. `npm install`, `npx` and plugins may execute downloaded code. Review dependencies, lifecycle scripts and hooks before a third-party installation, and save the lockfile after accepting a working setup.

### Linux and Windows

On supported Linux systems, install FFmpeg and Python through the system's package tools, and install Node in a way that actually provides the required version. Playwright may need system libraries. Its `install --with-deps chromium` command can modify system packages and needs suitable privileges. Do not treat `--no-sandbox` as a universal launch fix.

On Windows, choose either a native stack or WSL and keep the files and tools in the same environment. WSL Node, Windows Python and a separate Chrome path create three different assumptions about the filesystem. For a Python environment in PowerShell, you can invoke `.venv\Scripts\python.exe` directly without weakening execution policy. Check the selected engine's requirements: a portable command does not prove identical rendering on another OS.

## Build the first MP4 from two files

### Create the project

Create a clean directory. Network access is needed to install the package and browser; the scene itself makes no external resource requests.

```bash
mkdir patchwork-motion && cd patchwork-motion
npm init -y
npm install --save-exact playwright
npx playwright install chromium
mkdir out
```

The first install chooses the current Playwright version and records it exactly in `package.json`. Keep the resulting `package-lock.json`; use `npm ci` to recreate that version. The [Playwright browser documentation](https://playwright.dev/docs/browsers) explains that package versions are paired with specific browser binaries. Updating the dependency may require reinstalling the browser.

**Draft verification status.** The encoding commands have been tested with synthetic PNGs, but this exact example has not yet completed the browser-to-MP4 path. A suitable Chromium could not be installed and launched in the checking environment. Motion and legibility have not been visually reviewed. The steps below describe expected results and checks to perform on a working machine; they are not a report of a successful end-to-end run.

### Define the scene in index.html

Save the following file as `index.html`. It draws four simple states and reconstructs a frame at a specified time. Both languages are included so you can check localization without changing the drawing function.

```html
<!doctype html>
<html lang="ru">
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Patchwork motion study</title>
  <style>
    html,
    body {
      margin: 0;
      overflow: hidden;
      background: #eeeae1;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
    }
  </style>
  <canvas aria-label="Four stages of a fictional release workflow"></canvas>
  <script>
    const canvas = document.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    const params = new URLSearchParams(location.search);
    const labels =
      params.get("lang") === "en"
        ? ["Changes", "Groups", "Review", "Ready to ship"]
        : ["Изменения", "Группы", "Проверка", "Готовый выпуск"];
    const W = (canvas.width = innerWidth);
    const H = (canvas.height = innerHeight);
    const unit = Math.min(W, H);
    const clamp = (x) => Math.max(0, Math.min(1, x));
    const ease = (x) => {
      const p = clamp(x);
      return p * p * (3 - 2 * p);
    };

    window.seek = (seconds) => {
      if (!Number.isFinite(seconds)) throw new Error("Time must be finite");
      const t = Math.max(0, Math.min(16 - 1e-8, seconds));
      const scene = Math.floor(t / 4);
      const local = t - scene * 4;
      const enter = ease(local / 0.6);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#eeeae1";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#173f35";
      ctx.font = `700 ${unit * 0.075}px sans-serif`;
      ctx.fillText("PATCHWORK", W / 2, H * 0.17);
      const cardY = H * 0.38 + (1 - enter) * unit * 0.08;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(W * 0.12, cardY, W * 0.76, unit * 0.42);
      ctx.globalAlpha = enter;
      ctx.fillStyle = "#20241f";
      ctx.font = `600 ${unit * 0.065}px sans-serif`;
      ctx.fillText(labels[scene], W / 2, cardY + unit * 0.12);
      ctx.fillStyle = "#527465";
      for (let i = 0; i <= scene; i++) {
        ctx.fillRect(
          W * 0.22,
          cardY + unit * (0.22 + i * 0.04),
          W * (0.56 - i * 0.06),
          unit * 0.014,
        );
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#173f35";
      ctx.font = `400 ${unit * 0.035}px sans-serif`;
      ctx.fillText(`${scene + 1} / 4`, W / 2, H * 0.8);
    };
    window.ready = document.fonts.ready.then(() => window.seek(0));
    if (!params.has("render")) {
      window.ready.then(() => {
        const start = performance.now();
        const tick = (now) => {
          window.seek(((now - start) / 1000) % 16);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }
  </script>
</html>
```

In an ordinary browser, the page plays a looping preview. The `render=1` parameter disables its autonomous timer: during capture, only the renderer controls time. This separation matters. Another timer could repaint Canvas between `seek` and the screenshot even while the interactive preview looks correct.

`window.seek` and `window.ready` are conventions for this example, not browser APIs. The `ready` promise waits for `document.fonts.ready`, then draws the opening frame. The scene uses the system `sans-serif`, so letterforms can differ across operating systems. For delivery, choose a specific local font, verify that the required face loaded and retain its license. `document.fonts.ready` alone does not prove that a required font file loaded successfully.

### Capture frames with capture.mjs

Save the second file as `capture.mjs`:

```javascript
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import assert from "node:assert/strict";

const { values } = parseArgs({
  options: {
    start: { type: "string", default: "0" },
    end: { type: "string", default: "480" },
    width: { type: "string", default: "540" },
    height: { type: "string", default: "960" },
    out: { type: "string", default: "out/frames" },
    lang: { type: "string", default: "ru" },
  },
});
const start = Number(values.start),
  end = Number(values.end);
const width = Number(values.width),
  height = Number(values.height);
for (const n of [start, end, width, height]) assert.ok(Number.isInteger(n));
assert.ok(start >= 0 && end > start && end <= 480);
assert.ok(width > 0 && height > 0 && width % 2 === 0 && height % 2 === 0);
assert.ok(["ru", "en"].includes(values.lang));
// A fresh directory avoids mixing frames from different revisions.
await mkdir(values.out, { recursive: false });
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`http://127.0.0.1:8000/index.html?render=1&lang=${values.lang}`);
  assert.equal(response?.status(), 200);
  await page.evaluate(() => window.ready);
  const canvas = page.locator("canvas");
  const at = async (t) => {
    await page.evaluate((seconds) => window.seek(seconds), t);
    assert.deepEqual(errors, []);
    return canvas.screenshot({ type: "png" });
  };
  const reference = await at(5);
  await at(12);
  await at(1);
  assert.deepEqual(await at(5), reference, "Frame depends on seek order");
  for (let frame = start; frame < end; frame++) {
    const png = await at(frame / 30);
    await writeFile(`${values.out}/${String(frame).padStart(5, "0")}.png`, png);
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ start, end, frames: end - start, fps: 30, width, height, lang: values.lang }),
  );
} finally {
  await browser.close();
}
```

The script validates dimensions and frame ranges, refuses an existing output directory and closes the browser in `finally`. A new directory prevents PNGs from different revisions from being mixed. If a run fails, keep its directory for diagnosis and choose another name for the next run. Do not automatically clear a shared folder containing someone else's results.

The check inside the script captures the fifth second, seeks to the twelfth and first seconds, then captures the fifth again. The PNG bytes must match in that environment. This is a narrow test of independence from seek order. It does not judge design, establish cross-OS portability or test video and font loaders that have not been added.

### Check the first two seconds

In the first terminal, run a loopback-only server from the project directory:

```bash
python3.12 -m http.server 8000 --bind 127.0.0.1
```

It remains in the foreground. In a second terminal, enter the same directory and run:

```bash
node --check capture.mjs
node capture.mjs --end 60 --out out/smoke --lang en
ffmpeg -n -framerate 30 -start_number 0 -i out/smoke/%05d.png \
  -frames:v 60 -c:v libx264 -pix_fmt yuv420p -crf 18 \
  -movflags +faststart out/smoke.mp4
```

The expected result is a two-second vertical scene at 540 × 960 with no audio. Open it in a normal player and check for PATCHWORK, the card, its first label and the `1 / 4` indicator. This short run exercises capture and encoding on the first scene only. The complete export will reveal the joins between all four states, which are still simple switches at this stage.

`-n` prevents overwriting an existing output. `-framerate` describes the input image sequence, `-start_number` identifies the first PNG and `-frames:v` limits the encoded frame count. Save the encoding settings with the project. Accidentally changing the input rate changes the duration even if every image remains the same.

### Export all 480 frames

Once the short check succeeds, run the complete vertical export:

```bash
node capture.mjs --width 1080 --height 1920 --out out/full --lang en
ffmpeg -n -framerate 30 -start_number 0 -i out/full/%05d.png \
  -frames:v 480 -c:v libx264 -pix_fmt yuv420p -crf 18 \
  -movflags +faststart out/silent.mp4

ffprobe -v error -select_streams v:0 -count_frames \
  -show_entries stream=codec_name,width,height,r_frame_rate,nb_read_frames \
  -show_entries format=duration -of json out/silent.mp4
```

Check for H.264, 1080 × 1920 dimensions, a rate of 30/1 and 480 decoded frames. The image sequence should cover 16 seconds. A file appearing on disk does not establish successful completion: check FFmpeg's exit status and decoding of the output. Stop the HTTP server with Ctrl+C when you finish.

For the Russian version, use `--lang ru` and a separate output directory. Text length can change, so a new locale needs a visual review even when the technical settings match. The minimal layout is intended for a vertical scene; a proper horizontal adaptation needs its own composition.

## Make time the source of frame state

A frame should be computed from time and fixed inputs. A request for 8.2 seconds must produce the same result whether you approach it from the beginning or jump back from the end. This contract supports range exports, independent scene processing and motion blur without relying on calculation order.

Avoid accumulating `x += velocity`, creating a new particle on every draw or consuming another `Math.random()` value while painting. Generate random inputs once from a recorded seed, or derive them from stable object identifiers. Repeated calls may change the requested time, but must leave the initial positions, colors and object count intact.

Canvas state also needs to be restored. Transforms, opacity, fonts, alignment and line styles survive drawing calls. Each function should either set everything it uses or contain its local changes within `save`/`restore`. Do not rely on the previous scene leaving the correct settings behind.

Assets have their own readiness conditions. An image must finish decoding, a font must load the required face, and video must complete its seek. Assigning `video.currentTime` does not make the requested frame immediately available. Embedding video in Canvas therefore needs a separate loader and test; the minimal example does not provide one.

Use a consistent interval convention: include the start and exclude the end. At 30 fps, the range `[210, 270)` contains 60 frames, or two seconds of the original film starting at second seven. Scene time remains global. Restarting time at zero for each partial render would break transitions and audio alignment.

## Write a brief you can verify

For Patchwork, the desired outcome could be: a developer sees scattered changes become a coherent release package. The video contains four approved labels, one main object and a calm final screen. It lasts 16 seconds, starts with a vertical version and uses no external images or product promises.

Distinguish fixed requirements from creative choices. Exact copy, logos, duration and verified facts are fixed. Composition, card treatment and transition behavior remain open to selection. Leaving everything open invites the agent to reinterpret the task on every iteration. Prescribing every pixel removes the room needed to explore a direction.

Useful brief fields include the audience, placement, one message, intended viewer action, required text, formats, audio, permitted assets and acceptance criteria. Every real product number or claim needs a source. Do not let the model fill missing information with invented customers, savings figures or promises of results.

An initial creative request might look like this:

```text
Read project-brief.md and asset-manifest.md.
Create a 16-second film about the fictional Patchwork tool.
Message: changes move from a list to a finished release.
Use only the four approved labels in the brief.

Propose three directions with different compositions and motion.
For each, describe the main object, reading order, palette
and riskiest transition. Do not change code yet.
Keep the existing Canvas renderer and shared time contract.
```

Three nearly identical cards in different colors do not offer a useful choice. Ask for different organizing ideas: oversized type, one transforming container or a diagram of moving data. Choose a direction after the comparison and move on to still frames. Discussion without a recorded decision consumes time too.

## Connect the project documents

As the project grows, separating eight kinds of information can help. This is a map of responsibilities, not a requirement to create eight files for every short video. Do not replace an existing CSV consumed by code with Markdown just to make filenames consistent.

| Document            | Decision it owns                                      |
| ------------------- | ----------------------------------------------------- |
| `CLAUDE.md`         | Workflow, verification commands and change boundaries |
| `project-brief.md`  | Audience, message, facts, formats and acceptance      |
| `style-guide.md`    | Grid, fonts, palette, materials and motion roles      |
| `asset-manifest.md` | Files, origins, rights and permitted transformations  |
| `storyboard.md`     | Scene meaning and the transfer of attention           |
| `motion-spec.md`    | Time, scene boundaries, geometry and text tracks      |
| `audio-cues.md`     | Speech, music, effects and event timing               |
| `review-log.md`     | Defects, versions, corrections and rechecks           |

The documents should refer to the same scene identifiers. If `review` begins at second eight, an audio event and a review comment must find it unambiguously. A duration change should update dependent data, rather than just the prose script.

Keep machine-consumed numbers in one `project.json`: fps, dimensions, duration and scene definitions. Other documents explain decisions. Avoid maintaining four independent duration values in the renderer, audio script, README and brief. The minimal example still hard-codes these values. Moving to shared configuration requires changing how each dependent command reads and validates them; adding a JSON file alone will not do that.

A few testable rules are enough for `CLAUDE.md`: preserve approved copy, leave stable capture code alone during visual revisions, and recalculate frame counts after timeline changes. See [practical rules for CLAUDE.md](/en/blog/claude-md-12-rules/). “Quality must be 10/10” does not tell an agent how to detect a clipped label.

An asset register is useful even without generated footage. Record permitted scaling and colors for a logo, allowed crops for a screenshot, and whether a reference is for analysis only or can appear in the output. “Found,” “rights checked” and “approved” are distinct states. Replacing a file under the same name should be visible through its checksum.

## Check a still frame and an animatic

A reference is useful when it yields a specific rule. “Large type occupies the upper third, while the object is the only color accent” is something you can check. A request to reproduce another brand leaves too much undefined and increases the risk of copying recognizable elements.

Choose a few permitted references with different functions: composition, typography, movement and texture. For each, record what you will use and what you will leave behind. Twenty conflicting images with no priority often produce an averaged-out scene. A reference need not appear in the delivered film; its public availability does not grant that permission.

Ask for one still frame first. Consider where the viewer will look first, what they will read second and where movement can happen. Patchwork might use a warm background, a dark heading and one light card with a green accent. If the hierarchy fails without animation, adding highlights or blur makes the cause harder to identify.

After approving the still, assemble an animatic: the entire film in rough shapes, with exact copy and durations. Rectangles and simple switches are enough at this stage. Check the sequence of understanding: the viewer sees changes, understands grouping, notices review and recognizes the result. Decorative texture is unnecessary for discovering that a scene is too short.

For each state, specify when it starts, what changes, how long the viewer can read and how attention moves to the next object. Text appearing on screen does not mean reading begins immediately; movement first attracts attention. Watch the whole animatic and try it on a phone. If the main label requires pausing playback, extend its stable interval or shorten the wording without changing the meaning.

### Typography and adaptation

Use a small set of sizes and weights. A heading, a short main statement and a supporting label should have distinct roles. For Russian copy, check actual Cyrillic glyphs, including Ё and Й, rather than only a successful font request. A fallback can silently replace some characters.

`fillText` does not wrap text automatically. Real data needs `measureText`, a maximum width and an explicit line height. A long name should either wrap correctly or produce a clear input error. Shrinking it until it is unreadable merely hides the problem.

Square and landscape versions need different compositions: a card and heading can sit side by side, or a list can unfold horizontally. Uniformly shrinking a vertical design often leaves wasted space and tiny text. Check the longest string, normal viewing size and the platform interface that may cover the edges. There is no single safe zone for every placement.

## Carry an object through the transition

A coherent film passes attention from one state to the next. In Patchwork, a list card can expand, its lines can become groups and a marker can turn into a review check. Name the object that survives the boundary and define its form before and after the change.

Record its anchor point, dimensions, permitted corner-radius changes and movement direction. Animate the shell without text first. If its motion is already unclear, adding content will not explain it automatically. Testing one transition costs less than implementing all four scenes with different problems.

Geometry and labels need separate tracks. Old text can leave before a substantial shape change; new text can arrive once a readable area has opened. Stretching a bitmap of letters with the container often distorts the type. Recalculate its layout and animate position or opacity separately instead.

A cursor belongs where it explains an action. During a drag, the handle should follow a defined rule; a spring may take over after release. Unexplained lag makes the interface look broken. In a scene without an action, a cursor adds another object competing for attention.

A useful second exercise is one container moving through button, input, result and finished-package states. Preserve the focus point and continuous shape first, then add the contents. This exposes where a transition genuinely shares geometry and where the old object merely disappears behind a new one.

## Give movement a consistent character

A calm transition often needs only easing with zero velocity at its endpoints. The minimal example uses `p²(3 − 2p)` over a clamped interval. This is a useful interpolation function, not a material simulation. It organizes an entrance but does not inherently convey mass or elasticity.

Use a spring when its oscillation serves the movement. Its mass, stiffness and damping govern the response. With mass 1, critical damping is `2 × sqrt(k)`. For `k = 220`, that is approximately 29.66; a value of 32 is already overdamped. A preset called `criticalText` does not establish that its formula implements the critical case.

Motion must be reconstructible from time. For a simple spring, an analytical solution with explicit initial conditions is convenient. If numerical physics is necessary, use a fixed simulation step, preserve states and interpolate the result. If the integration step follows the interval between browser frames, machine load can change the calculated motion.

Separate three defects. A position discontinuity moves an object instantly. A velocity discontinuity preserves position but abruptly changes movement. A semantic discontinuity can look smooth while the viewer loses the relationship between objects. Graphs and value differences help with the first two; the third needs viewing and discussion of the story.

A character should move as a connected system: support, torso, gaze and secondary parts. One waving hand attached to an otherwise frozen body rarely communicates weight or intent. For a longer film, approve the silhouette, proportions and several poses first. Keep the shared rig, the system of connected body parts, and appearance rules in one place. Proportions, points of support and movement should remain consistent across scenes.

## Test the actual loop boundary

`t % duration` only sends time back to the beginning. The minimal preview uses it for convenient playback, but its four states do not form an artistically seamless loop. A loop requires the image, movement and sound to agree across the boundary.

One straightforward approach is to return the final composition to its opening state and let movement settle. Periodic rotation can also work when the duration contains a whole number of turns and other properties match. A camera, texture or small caption can still break the join even when the main object moves correctly.

Do not only compare time zero with time sixteen: modulo may make them identical by definition. Inspect `duration − 1/fps`, `0` and `1/fps`, then watch a short clip crossing the boundary several times. This reveals velocity jumps that disappear in a comparison of two still images.

Check audio separately. Waveform discontinuities, reverb tails and AAC playback behavior can introduce a click or pause. Quickly concatenating MP4 files with `-c copy` does not establish sample-accurate looping. Inspect decoded frames, PCM audio and the actual playback environment. If the brief needs a clear ending, a readable final hold may fit better.

## Put music on the shared timeline

For a music-led edit, choose the track before refining transitions. For narration-led work, settle the lines and measure their actual duration first. Adding an arbitrary track over a finished visual rhythm often produces accidental accents.

At 120 BPM, a beat lasts 0.5 seconds. In 4/4, a bar lasts two seconds, and eight bars take sixteen seconds. If the first downbeat is at zero, bar starts occur at 0, 2, 4 and onward. A transition at second five can be deliberate, but it does not satisfy a rule that every major change happens on a bar boundary.

An automatic beat tracker estimates beat positions. It can choose half or double time, use another phase or fail to find a stable pulse. Declaring every fourth detected beat a downbeat does not establish the bar structure. Check meter and phase by ear, then save the accepted timestamps as data tied to that particular audio version.

If you add Python analysis, use a separate virtual environment, check APIs against your chosen [librosa version](https://librosa.org/doc/latest/api/generated/librosa.beat.beat_track.html) and preserve its dependencies. The first film does not require this library. A few manually verified anchor points may be more useful than an elaborate detector whose accuracy nobody has assessed.

Leave quiet intervals. Major transitions can follow musical phrases while small details accent individual beats. If everything moves on every beat, text loses its stable role. A sound accent should reinforce a visible event rather than compensate for an unclear action.

## Add audio with an explicit duration policy

Keep music, voice and effects as separate tracks. You can then change the language, make a silent version or adjust balance without rebuilding the graphics. Mixing everything into an MP3 early limits these options and obscures the origins of individual sounds.

To combine video and audio, create an `assets` directory and place a local track you are allowed to use at `assets/music.wav`. The example does not include an audio file. The command below pads short audio with silence and trims long audio to sixteen seconds. This is an explicit technical policy; the musical ending still needs to be prepared and heard beforehand.

```bash
ffmpeg -n -i out/silent.mp4 -i assets/music.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy \
  -af "asetpts=PTS-STARTPTS,apad=whole_dur=16,atrim=duration=16" \
  -c:a aac -ar 48000 -b:a 192k -t 16 \
  -movflags +faststart out/final.mp4

ffprobe -v error -show_streams -show_format \
  -of json out/final.mp4 > out/final.probe.json
```

This does not normalize loudness. Do not use `-shortest` as an invisible repair: a short audio track can cut the video short. If you need a fade or the tail of a final note, include it in the agreed timeline instead of expecting the container to solve an artistic problem.

You can measure the final encoded file with [loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm):

```bash
ffmpeg -i out/final.mp4 -vn \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" \
  -f null - 2> out/loudness.log
```

In this report, `input_i` and `input_tp` describe the measured input, which is your finished file. `output_i` and `output_tp` describe another filter pass and must not be substituted for those measurements. The −16 LUFS target is an example setting, not a universal requirement for every platform.

For two-pass normalization, measure the source mix, supply the measured parameters to the second pass and check the result again after AAC encoding. Material with brief, high peaks may need dynamic processing to meet both the loudness target and the true-peak ceiling. Record measured integrated loudness, true peak and channel layout. Also assess speech through headphones and a phone speaker: a correct LUFS value does not remove frequency masking from music.

## Add motion blur after checking the trajectory

Motion blur averages several states within an exposure interval. It is an extra rendering stage and is deliberately absent from the minimal `capture.mjs`. Do not add imagined `--sub` or `--shutter` flags until that functionality has been implemented and tested.

Four samples per output frame turn sixteen seconds at 30 fps into 1,920 captures instead of 480. At 60 fps, the count becomes 3,840. Before applying blur to the whole film, test a short range and judge legibility. Strong blur may hurt typography more than it helps the movement.

Define the timing convention precisely. For symmetric midpoint samples around `n/fps`, four subframes and a shutter fraction of 0.5 produce offsets of −0.1875, −0.0625, 0.0625 and 0.1875 frame durations. The first frame asks for negative time. A loop can wrap; a linear film needs clamping, an initial hold or explicitly defined preroll.

If FFmpeg performs the averaging, remember that `tmix` uses a sliding window. Subframe groups and output selection must be explicit. Test the algorithm on images with known colors before judging a polished scene. Averaging encoded color values is also not physically equivalent to integrating light in linear space.

Fix incorrect fps, conflicting timers and velocity discontinuities first. Blur does not repair a broken timeline. Keep the approved unblurred render as the control version against which the new effect is compared.

## Give Claude one observable correction

“Make it more professional” does not identify what is wrong. A useful correction includes a time, observation, constraint and recheck. Suppose a revised Patchwork scene has an expanding card that covers its heading. The following is feedback for that hypothetical revision, not a defect found in the two starter files:

```text
Fix only the transition from 7.4 to 8.6 seconds.
As the card opens, it covers the bottom of the heading.
Keep copy, palette, font, fps and scene durations unchanged.
Do not modify capture.mjs or dependencies.

Identify the likely cause before editing.
After the change, show frames at 7.4, 7.8, 8.0, 8.3 and 8.6.
Then prepare a short clip covering seconds 7–9.
If a broader refactor is required, explain that dependency separately.
```

The new capture needs the same local HTTP server. If you stopped it after the full export, run `python3.12 -m http.server 8000 --bind 127.0.0.1` again from the project directory in a separate terminal. Leave it running and execute the following commands in a second terminal from that directory.

In this renderer, the 7–9-second range is:

```bash
node capture.mjs --start 210 --end 270 --out out/transition-v2 --lang en
ffmpeg -n -framerate 30 -start_number 210 \
  -i out/transition-v2/%05d.png -frames:v 60 \
  -c:v libx264 -pix_fmt yuv420p -crf 18 out/transition-v2.mp4
```

Input time still refers to the full film, while the exported clip starts at its own zero timestamp. That is why its PNG numbering starts at 210. Without the matching `-start_number`, FFmpeg would look for different files.

Do not combine a style revision, dependency update and engine replacement in one iteration. Preserve the working version, test the smallest hypothesis and decide whether to accept the result. A version number, request, affected files, check result and decision are enough for `review-log.md`. That record explains a week later why the card became slower.

If the model keeps changing adjacent parts, narrow the task and identify the relevant files. A fresh session with the current brief, style and defect list can be more useful than a long history of discarded decisions. What matters is the agreed current contract, not preserving every exchange in one context.

## Inspect the exported file in several ways

A contact sheet reveals major states, repeated compositions and missing objects. It cannot show smoothness or musical synchronization. For the sixteen-second film, extract one frame per second. These commands use the version with audio; if you skipped that step, substitute `out/silent.mp4` for `out/final.mp4`:

```bash
mkdir -p out/review
ffmpeg -n -i out/final.mp4 \
  -vf "fps=1,scale=270:-1,tile=4x4" \
  -frames:v 1 out/review/contact.png

ffmpeg -n -i out/final.mp4 \
  -vf "trim=start=7:end=9,setpts=PTS-STARTPTS,fps=5,scale=216:-1,tile=5x2" \
  -frames:v 1 out/review/transition.png
```

The first grid holds sixteen frames. A longer film needs several sheets: a fixed tile layout and a single PNG do not mean the entire work was reviewed. The second command selects the time range before building a denser transition grid.

Separate acceptance into layers:

1. Mathematics: time functions, interval boundaries, frame counts and movement parameters.
2. Browser: asset loading, page errors and pixel reconstruction after reordered seeks.
3. Encoding: codec, size, fps, decoded frame count, duration and readable output.
4. Audio: duration, channel layout, loudness, peaks, joins and intelligibility.
5. Content and perception: accurate copy, legibility, causal transitions and a clear result.

Passing one layer does not close the others. A mock Canvas tests calls and calculations but not actual glyphs. An MP4 hash identifies the entire encoded file, including its container data; it does not replace comparing the decoded images. Exact pixel hashes help in one pinned environment; cross-OS or cross-browser comparison may need thresholds and visual review.

Watch without sound, listen to the audio separately, then watch everything together at normal speed. Ask a critic for observable feedback: timestamp, defect, likely cause and smallest correction. “8 out of 10” does not explain whether the film is ready to deliver.

If a check was not run, say so in the report. Successfully reading the documentation is not the same as rendering a film. Keep the exact technical log with the checked example version; its conclusions do not transfer to a modified scene without rerunning the relevant checks.

## Package a repeated process as a skill

A template becomes useful after an accepted film and a successful repeat build. Extract what actually repeats: loading, text layout, the shared timeline, export and verification. Building a universal engine before finishing anything usually introduces more unknowns than it removes.

You can package the process as a [Claude Code skill](https://code.claude.com/docs/en/skills). For example, `.claude/skills/motion-review/SKILL.md` can define a separate review pass:

```markdown
---
name: motion-review
description: Review a draft film against its brief and render log.
disable-model-invocation: true
---

Read project-brief.md, motion-spec.md and the latest review-log.md.
Check the input revision, export settings and checks actually performed.
Inspect the contact sheet and available clip; identify unreviewed parts.
Return defects with timestamps and minimal corrections.
Do not edit code, publish the file or call paid services.
```

Calling `/motion-review` runs the described procedure. `disable-model-invocation` leaves invocation to the user; it does not restrict the process at the OS level or grant additional permissions. The [skills lesson](/en/courses/claude-code-guide/04-skills/) explains extension mechanics and placement.

If you later add an external asset catalog or voice service, test its contract independently of the model. A successful connection does not establish a correct response or authorized spending. The [MCP lesson](/en/courses/claude-code-guide/06-mcp/) covers that engineering work. The local Canvas example needs no MCP connection.

## Parallelize scenes after establishing a shared example

A longer film can be divided into independent chapters once the visual language is approved. Before parallel work, create a reference scene, shared components and boundary contracts: the main object's position, camera state, entrance and exit frames, duration and permitted dependencies.

One owner should control the shared timeline and final integration. Other contributors work on their scenes. If everyone writes a renderer, spring implementation and copy of the logo, integration begins with resolving incompatibilities. Check shared-component changes separately from visual revisions to individual chapters.

A [subagent](/en/courses/claude-code-guide/09-subagents/) suits a bounded task, such as verifying an educational scene's facts or reviewing several transitions. An [agent team](/en/courses/claude-code-guide/10-agent-teams/) also needs explicit file ownership. A separate conversation context does not imply a separate filesystem or protection from conflicting writes.

After integration, inspect the beginning and end of affected scenes and render short clips around joins. Changing one duration can shift speech and music throughout the rest of the film. For autonomous work, define file, spending and action limits in advance. User silence must not become permission to publish, start a subscription or send materials elsewhere.

## Adapt the workflow for an educational video

For educational video, start with a testable learning outcome. “Explain task queues” is too broad. A more precise goal is that the viewer can explain why a task waits for an available worker and how a queue differs from simultaneous execution. A visual model can show cards and a limited number of workstations, but its assumptions should be explicit.

Each scene needs a learning goal, a verifiable claim, a source, an action, a spoken line and a defined state at the end. Narration can explain what is not directly visible: a waiting condition, a limitation of the model or the cause of an error. It need not describe every card movement.

Record a scratch voiceover and make an animatic first. Then save final speech by scene, for example `queue-01-en-v2.wav`, with its exact text, version, language and measured duration. Replacing one line need not regenerate the entire voice track, but dependent pauses, events and subtitles still need recalculation.

At 135 words per minute, eighty seconds of uninterrupted speech holds about 180 words. This is an arithmetic estimate, not a standard for a comprehensible lesson. Difficult terminology and observation time reduce the useful amount of text. If the script does not fit, shorten the explanation or extend the scene; automatically accelerating speech may make it harder to understand.

Music under speech needs its own balance and smooth ducking: lowering the level during spoken lines. Choose the reduction for that voice and recording, then listen to its onset and recovery. Keep tracks separate. Before using external TTS, check permission to send the script, service terms and rights to the chosen voice.

Subtitles must match the final speech: words, numbers, negatives, terminology and phrase boundaries. Keep an editable SRT or VTT, and make a separate burned-in version when required. Large kinetic words do not replace accurate subtitles. Recheck line wrapping and overlap with the main object in the vertical version.

Acceptance includes subject-matter review and a retelling by someone from the intended audience. Attractive colors and smooth movement cannot correct a mistaken explanation of cause and effect. A model's numerical self-rating does not establish that a person understood the explanation.

## Treat generated footage as a separate input

Generated shots can help with reflections, complex materials or camera movement around a product. In that workflow, Claude helps prepare a shot list and edit the sequence, while another service generates the shot's pixels. Save accepted clips locally, and keep exact prices, labels and logos in controlled graphic layers.

One such tool is [Creatify's Boreal-H3](https://labs.creatify.ai/models/boreal-h3). This branch is optional for a code-based film. Before spending money, open the current documentation for the selected mode, pricing and material-transfer terms. Do not infer downloadable local weights or reliable brand fidelity from a demonstration page.

Prepare consistent views of one product and list the properties that must not change. For each shot, define its purpose, duration, framing, camera movement, lighting, references and exit state. Rejection criteria should be specific: an extra button, changing port, incorrect label, distorted logo or shifting color.

Start with one short shot and a bounded number of attempts. Review the entire clip, including intermediate frames. An attractive thumbnail does not establish that a product remains consistent while rotating. Preserve the accepted file, parameters, job identifier and actual cost. A repeated generation request is not the same as a repeated deterministic render.

After a network timeout, establish what happened to the existing job before repeating a paid POST. Keep API credentials in a protected local or server-side process. Hosting an input at a URL the provider can access is itself a data transfer; do not make a confidential asset public for convenience.

Once accepted, inspect the clip's actual dimensions, fps, duration and audio. The compositor must support accurate video handling. The minimal Canvas capture does not implement this: adding generated footage needs a separate media stage and seek verification.

## Separate interactive explanations from linear films

An interactive experiment adds user actions to the initial parameters. A viewer might change the number of workers and observe queue length. Define the model first: arrival rules, processing time, parameter limits and the quantities shown on the chart. A decorative counter must not operate independently of the calculation.

Separate computation, presentation, user commands and experiment recording. Play, Pause and Reset must control the model and its measurements consistently. Applying new parameters after Reset is simpler for a first version. If changes are allowed during execution, specify whether they apply from that moment or recalculate the entire experiment.

For replay, record the model version, initial parameters, seed and timestamped events. Analytical calculation does not always fit; a numerical simulation may require fixed time steps and state checkpoints. Adding a `seek` function does not automatically make arbitrary access correct.

To export one experiment as MP4, first freeze that experiment and its state-reconstruction method, then use frame-by-frame capture. Screen fps and simulation timestep are different quantities. Test reference cases, range boundaries, repetition after Reset and resuming a background tab.

Interactive work requires additional checks: keyboard access, visible focus, labels with units, comparisons that do not rely only on color and a reduced-motion option. A target such as 60 fps needs verification on actual devices. This branch can wait during the first motion project; it has a different product outcome and its own acceptance criteria.

## Starting with Remotion or HyperFrames instead

Set up the alternative engine in a separate project. Keep the brief, style and quality criteria, but use that engine's own time contract. Copying a Canvas renderer over another runtime introduces competing mechanisms for controlling frames.

### Remotion

The current official setup route is:

```bash
npx create-video@latest --yes --blank --no-tailwind patchwork-remotion
cd patchwork-remotion
npm install
npx remotion skills add
npm run dev
```

In another terminal in the same directory, start Claude Code and create a composition with an explicit ID, fps, dimensions and duration. Then inspect the actual list:

```bash
npx remotion compositions
npx remotion render Main out/launch.mp4 \
  --codec h264 --pixel-format yuv420p --crf 18
```

The second command assumes the composition is really called `Main` and its entry point was detected automatically. Use the ID returned by the list, and provide the actual entry point if needed, following the [render CLI reference](https://www.remotion.dev/docs/cli/render). Remotion composition duration is expressed in frames. Compute animation through frame-driven APIs rather than a timer started when a component mounts.

Check system requirements and the [Remotion license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md) before commercial use. The project has its own terms, not a universally permissive MIT license. Team size and use case affect the required permission, and terms may change between versions.

### HyperFrames

For a standalone CLI project:

```bash
npx hyperframes init patchwork-hyperframes --non-interactive
cd patchwork-hyperframes
npx hyperframes skills update
npx hyperframes doctor
npx hyperframes lint
npx hyperframes check --snapshots
npx hyperframes snapshot --at 0,1,2 --no-end --describe false
npx hyperframes render --output out/video.mp4
```

Follow the [CLI documentation](https://hyperframes.heygen.com/packages/cli) for the installed version. The root composition, timing attributes and registered paused GSAP timelines must agree. Do not substitute a custom `window.seek` for the runtime's prescribed mechanism.

The snapshot flags are deliberate: `--no-end` prevents an extra end frame, and `--describe false` disables optional model-generated descriptions. Otherwise, a configured API key can cause the tool to perform external analysis. Local export and publication are separate actions; saving an MP4 requires no publication.

The HyperFrames repository uses Apache 2.0. Media, font, music and connected-service terms still need separate review. Those obligations apply with any engine, even when its code permits commercial use.

## Produce variants and a delivery package

Format, language and copy variation should be inputs. Give each export an identifiable name, such as `patchwork_release_en_9x16_v003.mp4`. A shared timeline can be reused, but each variant still needs layout and legibility checks.

Start with a sequential batch runner. It should stop on failure and keep a log for the affected variant. Several Chromium processes quickly increase memory use, while parallel encoders compete for CPU. Optimize after measuring the bottleneck and verifying frame independence.

Distinguish review, master and delivery outputs. A draft can be smaller for faster feedback. A master preserves quality for derivative versions. Delivery matches the recipient's requirements. H.264 with `yuv420p` is practical for broad playback, but it does not carry a transparent background. Agree on an alpha-capable format separately and test it with the recipient.

The delivery manifest should record the commit, input versions, commands, environment, file list and checksums. The README should explain dependency restoration and rendering. Include sources, authorized assets, licenses and known limitations; exclude credentials, `node_modules`, browser caches and incidental working material.

Before handing it over, unpack the bundle into a new directory and rebuild from the README. This catches a missing font, an absolute path or a file that existed only on the original machine. A successful repeat in one environment does not establish identical results everywhere, so state where verification actually happened.

## Measure the cost of an accepted version

Separate model use, paid generations, local rendering, storage and human revisions in the budget. Count rejected takes against the generation budget, not just the clip you keep. A quoted price per second of output may exclude subscriptions, taxes and preparation.

Useful project measures include time to the first preview, meaningful revision count, capture and encoding duration, subframe count, actual API spending and human time. Compare the same resolution, fps and range. A cold run that installs Chromium and a repeated render measure different things.

When the process is slow, first reduce draft dimensions, range length and sample count. Measure capture and encoding separately. Large shadows, procedural textures or software-rendered WebGL may take longer than the rest of the scene combined. Increasing concurrency before diagnosis can simply make the failure harder to investigate.

A template earns its keep when the second video uses verified infrastructure and needs less repeated setup. Your own projects can establish that. Avoid promising universal production times or savings without such evidence.

## What to inspect when something breaks

- Command missing: check PATH, the current directory and the actual version. Changing a model name only in the prompt will not grant access to it.
- Chromium will not start: match the browser installation to Playwright and read the missing-library or OS-support error. Do not blindly bypass isolation.
- Empty frame: inspect the HTTP response, page errors and readiness of the specific asset. Serve only the required project directory.
- Smooth preview, jerky export: look for a second timer, accumulated state, a frame-rate error or an incorrect seek.
- Damaged FFmpeg output: check stderr, the exit status, missing PNGs and the sequence's starting number.
- Gradually drifting audio: check tempo and the shared timeline. A constant shift more often suggests an offset; growing drift suggests duration or tempo.
- Clipped text in one variant: examine its layout, real font metrics and long strings. Unreadably small type is not an acceptable adaptation.
- A revision breaks another scene: compare the diff and retest affected ranges before changing another parameter.

The first project is complete when you can recreate its MP4 from a clean folder, explain its timeline and show technical and visual check results. Then replace the brief and produce a second film through the same process. Repeating the release reveals which parts have actually become a working system.
