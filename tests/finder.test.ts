import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchedule } from "../src/lib/swapper/parser";
import {
  findSwapCandidates,
  listPeople,
  listShiftsForPerson,
} from "../src/lib/swapper/finder";
import { isValidSwap } from "../src/lib/swapper/rules";
import { getShift, shiftsAreSwappable } from "../src/lib/swapper/shifts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "fixtures",
  "schedule_141955_d4hqth5sqw.csv",
);
// fixtures/ is git-ignored (resident names) — see note in parser.test.ts. When
// the CSV is absent, the fixture-backed suites below skip; they run in full
// locally where it is present.
const hasFixture = existsSync(FIXTURE_PATH);
const fixtureCsv = hasFixture ? readFileSync(FIXTURE_PATH, "utf-8") : "";
const schedule = hasFixture
  ? parseSchedule(fixtureCsv)
  : (undefined as unknown as ReturnType<typeof parseSchedule>);

describe.skipIf(!hasFixture)("listPeople", () => {
  it("returns a non-trivial alphabetized list", () => {
    const people = listPeople(schedule);
    expect(people.length).toBeGreaterThan(50);
    const sorted = [...people].sort((a, b) => a.localeCompare(b));
    expect(people).toEqual(sorted);
  });

  it("contains known names from the schedule", () => {
    const people = listPeople(schedule);
    expect(people).toContain("Addison Sparks");
    expect(people).toContain("Sarah Loftus");
  });
});

describe.skipIf(!hasFixture)("listShiftsForPerson", () => {
  it("returns only shifts belonging to that person", () => {
    const shifts = listShiftsForPerson(schedule, "Addison Sparks");
    expect(shifts.length).toBeGreaterThan(0);
    expect(shifts.every((s) => s.personName === "Addison Sparks")).toBe(true);
  });

  it("returns shifts sorted by start time", () => {
    const shifts = listShiftsForPerson(schedule, "Addison Sparks");
    for (let i = 1; i < shifts.length; i++) {
      expect(shifts[i].startDt.getTime()).toBeGreaterThanOrEqual(
        shifts[i - 1].startDt.getTime(),
      );
    }
  });

  it("returns an empty array for an unknown name", () => {
    expect(listShiftsForPerson(schedule, "Nobody Here")).toEqual([]);
  });
});

describe.skipIf(!hasFixture)("findSwapCandidates — July 2026 fixture", () => {
  // Use Addison Sparks' first shift as a sample request.
  const addison = hasFixture
    ? listShiftsForPerson(schedule, "Addison Sparks")
    : [];
  const original = addison[0];

  it("returns a non-empty list for a typical request", () => {
    expect(original).toBeDefined();
    const candidates = findSwapCandidates(original, schedule);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("never returns the requester themselves", () => {
    const candidates = findSwapCandidates(original, schedule);
    expect(
      candidates.every((c) => c.candidatePerson !== "Addison Sparks"),
    ).toBe(true);
  });

  it("never returns the requester's own original shift", () => {
    const candidates = findSwapCandidates(original, schedule);
    const sameSlot = candidates.find(
      (c) =>
        c.candidateShift.date === original.date &&
        c.candidateShift.shiftLabel === original.shiftLabel,
    );
    expect(sameSlot).toBeUndefined();
  });

  it("only returns swap-class-compatible candidates", () => {
    const reqCat = getShift(original.shiftLabel);
    const candidates = findSwapCandidates(original, schedule);
    for (const c of candidates) {
      expect(
        shiftsAreSwappable(reqCat, getShift(c.candidateShift.shiftLabel)),
      ).toBe(true);
    }
  });

  it("every returned candidate independently passes isValidSwap", () => {
    const candidates = findSwapCandidates(original, schedule);
    for (const c of candidates) {
      expect(isValidSwap(original, c.candidateShift, schedule)).toBe(true);
    }
  });

  it("returns candidates grouped by person (alphabetical), then by start time", () => {
    const candidates = findSwapCandidates(original, schedule);
    for (let i = 1; i < candidates.length; i++) {
      const prev = candidates[i - 1];
      const curr = candidates[i];
      const personCmp = prev.candidatePerson.localeCompare(curr.candidatePerson);
      expect(personCmp).toBeLessThanOrEqual(0);
      if (personCmp === 0) {
        expect(curr.candidateShift.startDt.getTime()).toBeGreaterThanOrEqual(
          prev.candidateShift.startDt.getTime(),
        );
      }
    }
  });

  it("returns no candidates when the original is a Risk shift (Risk is non-swappable)", () => {
    // Risk is in the schedule but is not a valid `requesterShift` per rules.
    const risk = schedule.assignments.find((a) => a.shiftLabel === "Risk Senior");
    expect(risk).toBeDefined();
    expect(findSwapCandidates(risk!, schedule)).toEqual([]);
  });
});
