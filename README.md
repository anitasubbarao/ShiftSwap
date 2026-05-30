# ShiftSwap

A static web app that suggests valid shift-swap candidates for residents in a
medical center's monthly on-duty schedule. You open the month's schedule —
a `.csv` or an Excel `.xls`/`.xlsx` — pick your name, click the shift you want
to swap out of, and ShiftSwap shows who you can ask to trade with, subject to
the rest, level, and Risk rules in `rules.txt`.

Everything runs in your browser. The schedule is parsed and queried locally;
no data is uploaded, and nothing leaves your machine.

## Tech

- **React 19 + TypeScript**, built with **Vite**
- **Tailwind CSS v4** for styling
- **papaparse** (CSV) and **date-fns** (date math)
- **SheetJS** (`xlsx`) to read Excel `.xls`/`.xlsx`, loaded on demand so CSV users don't download it
- Domain logic lives framework-free in `src/lib/swapper/`
- Deployed as static files to **GitHub Pages** via `.github/workflows/deploy.yml`

## Run it locally

You normally don't need to — the live site is at
**https://anitasubbarao.github.io/ShiftSwap/**. Run it locally only when you want
to change the code or try it offline.

### 1. Install Node.js (one time)

You need **Node.js 20.19+ or 22.12+**. Check what you have:

```sh
node --version
```

If that errors or shows an older version, install the latest **LTS** from
[nodejs.org](https://nodejs.org/) (the macOS `.pkg` installer).

### 2. Get the code (one time)

```sh
git clone https://github.com/anitasubbarao/ShiftSwap.git
cd ShiftSwap
npm install        # downloads dependencies into node_modules/
```

### 3. Start it

```sh
npm run dev
```

Leave that running. It prints a line like:

```
➜  Local:   http://localhost:1420/
```

### 4. Access it

Open **http://localhost:1420/** in your browser. Then:

1. Click **Open schedule** and pick the month's file (`.csv`, `.xls`, or `.xlsx`).
2. Choose your name.
3. Click the shift you want to swap out of — the people you can trade with
   appear on the left.

The page hot-reloads as you edit the code. Press `Ctrl+C` in the terminal to
stop the server.

### Other commands

```sh
npm test           # run the test suite once
npm run build      # production build into dist/
npm run preview    # serve the production build locally to sanity-check it
```

> **Deploying:** you don't run the build by hand to publish. Pushing to `main`
> triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub
> Pages automatically.

## Schedule fixtures

Real schedule CSVs hold resident names, so `fixtures/` is git-ignored and never
pushed. The fixture-backed tests skip automatically when the CSV is absent (CI,
fresh clones) and run in full locally when it is present.

See `CLAUDE.md` for the full design notes, swap rules, and CSV format.
