# Demo guide

## Before you present

- [ ] Open the published site in the browser you'll present from. Open **Settings**, paste your key, click **Test connection**, then **Save settings**. The chip in the top right should say **AI: Gemini** (or your provider), not **AI: Demo**.
- [ ] Run one plan request beforehand so you know the key and model work.
- [ ] Load sample data: **Settings → Replace with sample week**.
- [ ] Browser zoom at 110–125% so the room can read it. Close other tabs.
- [ ] Backup: if the network fails, click **Remove key** in Settings. Demo mode still shows the whole flow, clearly labeled, and everything else works offline.
- [ ] Optional: to show the first-run setup, open the site in a private window.

## Live demo script (about 4 minutes)

| Time | Do | Say |
|---|---|---|
| 0:00 | Open **Today**. | "Students plan without knowing how long things take. FocusFlow closes the loop: plan, track, reflect, improve." |
| 0:20 | In the quick add box type `CS homework 5 2h today high #homework`. Point at the preview chips, then press Enter. | "I type it the way I'd say it, and it shows what it understood before saving. Every task gets an estimate, so we can compare it with reality later." |
| 0:40 | Click **Start** on the task. Point at the yellow timer in the header. Refresh the page. | "The timer is computed from timestamps, so it survives a refresh. It follows me on every page." |
| 1:00 | On **Focus**, click **Stop and save**. In the check-in sheet pick **Low** energy, tag **Distraction**, write one line, **Save**. | "A 10-second check-in. The journal is private. The AI never sees it unless I opt in, per review." |
| 1:20 | Use **Log time by hand** for 120 minutes. | "I can't wait two hours on stage, so I'm logging the session." |
| 1:35 | Open **Insights → Week**. Point at the gray **Calculated** labels and the estimate ledger. | "Every number is calculated by code, never by the AI. The ledger shows my estimates against what really happened." |
| 2:00 | In the review panel tick **Include my journal**, open **See the exact data**, then **Write my review**. Watch the 5-step progress strip. | "Here's exactly what goes to the model. The review must cite numbers from my data and give exactly two things to try." |
| 2:30 | Open **Checked by FocusFlow**. Click **Add as a task** on a suggestion. | "This is the iterative-refinement loop: code checks the draft and sends specific problems back. Suggestions become tasks in one click." |
| 2:50 | Back on **Today**, click **Plan the rest of my day**. Untick a block, then **Add N blocks to today**. Click **Undo** on the toast, then add again. | "Persona and few-shot examples teach it to fit my time, add breaks, and say what didn't fit. I choose every block, and everything can be undone." |
| 3:20 | Open **AI history**. Expand the plan. | "Every request is logged: what was sent, how it was checked, how many tokens it used on my own key." |
| 3:40 | Press **Ctrl K**, type "journal", Enter. Click the check-in from earlier in the Entries panel to read it, click **Hide** to fold the panel away, then show the published URL. | "It's live on GitHub Pages. Everyone brings their own key, stored only in their browser, so it's free to run. Questions?" |

### If someone asks…

- **"How do you stop hallucinated numbers?"** The review validator extracts every number in the answer and rejects any that don't appear in the input data (unit conversions allowed). Failures go back to the model.
- **"What if the model never gets it right?"** After two revisions, plans are re-packed by code to fit the window, with a visible warning. Reviews keep their content but list what couldn't be verified.
- **"Which prompt patterns?"** Persona (shared system prompt), few-shot (a worked example before each request), iterative refinement (validate, then revise up to twice). See `src/lib/prompts.js` and `src/lib/ai.js`.
- **"Where does my key go?"** Only into this browser's storage and directly to the provider. There's no FocusFlow server, and exports leave the key out.
- **"What's the stack?"** React, Vite, Tailwind and shadcn/ui, built and published by GitHub Actions. The "backend" is a set of REST-style routes running in the browser over localStorage.

## Short video (under 2 minutes, vertical)

Record the browser at a phone-like width (about 430 px, or the browser's device toolbar) so it fills a vertical frame. The phone layout has bottom tabs. Keep each shot short and add captions; many people watch muted.

| Time | Shot | Caption / voiceover |
|---|---|---|
| 0:00–0:08 | Close-up of a long to-do list. | "My plans never match reality." |
| 0:08–0:15 | FocusFlow **Today** screen. | "So I built an AI planner that learns how long my work really takes." |
| 0:15–0:30 | Type `Lab report 90m fri high`, the preview chips appear, tap **Start**. | "Add a task the way you'd say it. Start the timer." |
| 0:30–0:45 | **Stop and save**, the check-in sheet: energy, a tag, one line. | "Ten seconds to note how it went." |
| 0:45–1:05 | **Insights**: scroll to the estimate ledger; zoom on a task that ran over. | "Every number is calculated by code. Here's where my estimates were wrong." |
| 1:05–1:25 | **Write my review**: the progress strip runs, then the summary and two suggestions. | "The AI reviews my week, using only my real numbers." |
| 1:25–1:40 | **Plan the rest of my day**: the strip shows "sent back 1×", open **Checked by FocusFlow**. | "If its plan doesn't fit my time, my code sends it back to fix it." |
| 1:40–1:52 | Untick a block, tap **Add N blocks to today**, the timeline appears with **Undo** on the toast. | "I choose what goes on my day. Nothing changes without me." |
| 1:52–2:00 | Logo / title card. | "FocusFlow. Plan, track, reflect, improve." |

Tip: for the refinement shot, set **Until** to one hour from now with several tasks due. Real models often overbook on the first draft, which makes the check-and-revise step visible.
