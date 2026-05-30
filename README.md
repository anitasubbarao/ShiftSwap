# ShiftSwap

A static web app that suggests valid shift-swap candidates for residents in a
medical center's monthly on-duty schedule. You open the month's CSV, pick your
name, click the shift you want to swap out of, and ShiftSwap shows who you can
ask to trade with — subject to the rest, level, and Risk rules in `rules.txt`.

Everything runs in your browser. The schedule is parsed and queried locally;
no data is uploaded, and nothing leaves your machine.

## Tech

- **React 19 + TypeScript**, built with **Vite**
- **Tailwind CSS v4** for styling
- **papaparse** (CSV) and **date-fns** (date math)
- Domain logic lives framework-free in `src/lib/swapper/`
- Deployed as static files to **GitHub Pages** via `.github/workflows/deploy.yml`

## Develop

Requires Node 20.19+ (or 22.12+).

```sh
npm install
npm run dev      # http://localhost:1420
npm test         # run the Vitest suite
npm run build    # production build to dist/
```

## Schedule fixtures

Real schedule CSVs hold resident names, so `fixtures/` is git-ignored and never
pushed. The fixture-backed tests skip automatically when the CSV is absent (CI,
fresh clones) and run in full locally when it is present.

See `CLAUDE.md` for the full design notes, swap rules, and CSV format.
