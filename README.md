# JFT-Basic Practice

Static web app for practicing the JFT-Basic (国際交流基金日本語基礎テスト / Japan Foundation Test for Basic Japanese) using 5 model papers. Plain HTML + vanilla JS, no backend, no build step.

## Features

- **Mock exam** — 60-minute timed test that mirrors the real JFT-Basic format. Score reported on the 10–250 scale with section-wise breakdown.
- **Section drill** — untimed practice on one of the four sections (Script/Vocab, Conversation/Expression, Listening, Reading) with instant feedback and bilingual explanations.
- **Review wrong answers** — automatic queue of every question you have answered incorrectly, persisted across sessions via `localStorage`.
- **Listening with browser TTS** — uses the browser's Japanese `SpeechSynthesis` voice. Exam mode caps replays at 2 (mimics real JFT); practice mode allows unlimited replays.
- **Offline-capable** — once loaded, runs without internet.

## Run locally

The app uses `fetch()` to load JSON data, so it must be served over HTTP (it will not work when opened directly via `file://`).

```powershell
cd jft-practice-app
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

Any static server works (e.g. `npx serve`, `http-server`, etc.).

## Regenerating the question bank

`data/papers/paper-{1..5}.json` are generated from the `05-Mock-Tests/` text files using `tools/parse_paper.py`. If you edit the source `.txt` files, re-run:

```powershell
cd jft-practice-app
python tools/parse_paper.py
```

The parser handles three format variants automatically (`【Qn】` / `Qn.` markers and `A)` / `A.` option styles).

## Deploy to GitHub Pages

The app is fully static and contains a `.nojekyll` file, so it deploys to GitHub Pages without any custom domain.

1. Create a new GitHub repository (e.g. `jft-practice-app`).
2. From the `jft-practice-app/` directory:
   ```powershell
   git init
   git add .
   git commit -m "Initial JFT-Basic practice app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/jft-practice-app.git
   git push -u origin main
   ```
3. In the repo on github.com → **Settings** → **Pages** → **Build and deployment** → **Source: Deploy from a branch** → branch `main`, folder `/ (root)` → **Save**.
4. After a minute or two, the app will be live at `https://<your-username>.github.io/jft-practice-app/`.

## Browser support

Modern Chrome, Edge, Firefox, Safari. The listening section depends on `window.speechSynthesis` with a Japanese (`ja-JP`) voice — quality varies by OS/browser. Windows Edge has the best built-in Japanese voices.

## File layout

```
jft-practice-app/
├── index.html              Landing page (mode + paper picker)
├── exam.html               Timed 60-min exam UI
├── practice.html           Untimed section drill
├── review.html             Wrong-answer review
├── results.html            Score + section breakdown
├── css/styles.css
├── js/
│   ├── app.js              Shared helpers + fetch wrappers
│   ├── landing.js          Picker logic for index.html
│   ├── exam.js             Timer, navigation grid, submit flow
│   ├── practice.js         Section drill with inline feedback
│   ├── review.js           Wrong-answer queue replay
│   ├── results.js          Results page rendering
│   ├── scoring.js          Raw correct → scaled 10-250
│   ├── storage.js          localStorage abstraction
│   └── tts.js              ja-JP SpeechSynthesis wrapper
├── data/
│   ├── index.json          Paper metadata
│   └── papers/             paper-1.json … paper-5.json
├── tools/parse_paper.py    Regenerates paper JSON from text source
└── .nojekyll               Tells GitHub Pages to serve files as-is
```

## Scoring formula

This app uses a linear approximation of JFT-Basic's scaled scoring:

```
scaled = round((correct / 60) × 240 + 10)        // range: 10..250
passed = scaled >= 200
```

The real JFT-Basic exam uses Item Response Theory (IRT), so absolute scores from this app will not match official results — but the relative ranking and section-wise breakdown are reliable for measuring progress.

## Author

**Dulhara Lakshan** — Software Engineer · AI/ML Tutor · Web Developer

- Portfolio: [dulharalakshan.me](https://dulharalakshan.me)
- This app: [github.com/dulhara19/jft-practice-app](https://github.com/dulhara19/jft-practice-app)
- Live: [dulhara19.github.io/jft-practice-app](https://dulhara19.github.io/jft-practice-app/)
- Search: *"Dulhara Lakshan"* on Google for other projects and articles.

## License

© 2026 Dulhara Lakshan. All rights reserved · 著作権所有.

This software, its question bank, derived datasets, bilingual explanations, and visual design are the original work of the author. Personal study use is permitted. **Printing, redistribution, commercial use, and use for training ML models are prohibited without written permission.** See [LICENSE](LICENSE) for full terms.

For commercial licensing or redistribution permission, contact via [dulharalakshan.me](https://dulharalakshan.me).

## Acknowledgements

- **Japan Foundation (国際交流基金)** — JFT-Basic test specification and Irodori reference materials.
- **Google Fonts** — Shippori Mincho B1, Noto Sans JP, JetBrains Mono.
