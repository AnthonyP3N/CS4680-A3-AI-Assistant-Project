# Demo guide

## Before you present

- [ ] Open the published site in the browser you'll present from. In **Settings**, paste your key, click **Test connection**, then **Save settings**. The line under the Coach form should name your provider, not "Demo mode".
- [ ] Run one plan request beforehand so you know the key and model work.
- [ ] Load the sample weeks: **Settings → Replace with sample week**.
- [ ] Browser zoom at 110–125% so the room can read it. Close other tabs.
- [ ] Backup: if the network fails, click **Remove key** in Settings. Demo mode still shows the whole flow, clearly labeled, and everything else works offline.

## Live demo script (about 4 minutes)

| Time | Do | Say |
|---|---|---|
| 0:00 | Open **Today**. | "Students plan without knowing how long things take. FocusFlow closes the loop: plan, track, reflect, improve." |
| 0:20 | Add *"CS homework 5"*, 120 min, high priority, due today. | "Every task gets an estimate, so we can compare it with reality later." |
| 0:40 | Click ▶ on the task. Show the timer and the yellow pill in the top bar. Pause, refresh the page, resume. | "The timer is computed from timestamps, so it survives a refresh or a dropped connection." |
| 1:00 | Stop, add a note, tick *"Write a journal reflection next"*. Write one line, tag **Distraction**. | "The journal is private. The AI never sees it unless I opt in." |
| 1:20 | Back on **Focus**, use *Log time by hand* for 120 minutes. | "I can't wait two hours on stage, so I'm logging the session." |
| 1:35 | Open **Insights → Week**. Open one "How this is counted". Point at the estimate ledger. | "Every number is calculated by code, never by the AI. The ledger shows my estimates against what really happened." |
| 2:05 | Click **Review this week with Coach**, tick *Include my journal*, **Write my review**. | "The review must cite numbers from my data as evidence, and give exactly two things to try." |
| 2:35 | Open **How this was checked** and **What the coach saw**. | "This is the iterative-refinement loop: code checks the draft and sends specific problems back. And this is the exact data the model received." |
| 3:00 | **Plan tomorrow with this in mind → Draft a plan**. Uncheck a block, change a duration, watch the budget line, then **Add blocks**. | "Persona and few-shot examples teach it to fit the time budget, add breaks, and say what didn't fit. I stay in control: nothing changes until I accept." |
| 3:30 | Show the plan on **Today**, then the published URL. | "It's live on GitHub Pages. Everyone brings their own key, stored only in their browser, so it's free to run. Next: sync across devices, recurring tasks, and coaching styles. Questions?" |

### If someone asks…

- **"How do you stop hallucinated numbers?"** The review validator extracts every number in the answer and rejects any that don't appear in the input data (unit conversions allowed). Failures go back to the model.
- **"What if the model never gets it right?"** After two revisions, plans are re-packed by code to fit the window, with a visible warning. Reviews keep their content but list what couldn't be verified.
- **"Which prompt patterns?"** Persona (shared system prompt), few-shot (a worked example before each request), iterative refinement (validate → revise up to twice). See `public/js/lib/prompts.js` and `public/js/lib/ai.js`.
- **"Where does my key go?"** Only into this browser's storage and directly to the provider. There's no FocusFlow server, and exports leave the key out.

## Short video (under 2 minutes, vertical)

Record the browser at a phone-like width (about 430 px, or the browser's device toolbar) so it fills a vertical frame. Keep each shot short and add captions; many people watch muted.

| Time | Shot | Caption / voiceover |
|---|---|---|
| 0:00–0:08 | Close-up of a long to-do list. | "My plans never match reality." |
| 0:08–0:15 | FocusFlow **Today** screen. | "So I built an AI planner that learns how long my work really takes." |
| 0:15–0:30 | Add a task with an estimate, tap ▶, the timer ring starts filling. | "Add a task. Start the timer." |
| 0:30–0:45 | Stop, write a one-line journal note with a tag. | "Save the session, jot down what got in the way." |
| 0:45–1:05 | **Insights**: scroll to the estimate ledger; zoom on a task that ran over. | "Every number is calculated by code. Here's where my estimates were wrong." |
| 1:05–1:25 | **Coach → Review**: the summary and two suggestions appear. | "The AI coach reviews my week, using only my real numbers." |
| 1:25–1:40 | **Draft a plan**: open "How this was checked" showing a draft that failed and a revision that passed. | "If its plan doesn't fit my time, my code sends it back to fix it." |
| 1:40–1:52 | Uncheck a block, tap **Add blocks**, cut to the Today timeline. | "I choose what goes on my calendar. Nothing changes without me." |
| 1:52–2:00 | Logo / title card. | "FocusFlow. Plan, track, reflect, improve." |

Tip: for the refinement shot, ask for a plan with only 60 available minutes and several tasks due. Real models often overbook on the first draft, which makes the check-and-revise step visible.
