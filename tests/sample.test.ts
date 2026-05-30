/**
 * Domain-logic tests against a small, fully synthetic schedule
 * (`tests/sample-schedule.csv`, March 2026). All names are made up, so this
 * fixture is safe to commit and runs everywhere — including CI, where the real
 * `fixtures/` schedule is intentionally absent.
 *
 * The real July 2026 fixture remains the canonical regression case in
 * parser.test.ts / finder.test.ts; those suites skip when it is not present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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
const csv = readFileSync(join(__dirname, "sample-schedule.csv"), "utf-8");
const schedule = parseSchedule(csv);

describe("parseSchedule — synthetic March 2026 sample", () => {
  it("extracts year and month from the title row", () => {
    expect(schedule.year).toBe(2026);
    expect(schedule.month).toBe(3);
  });

  it("preserves the title line", () => {
    expect(schedule.titleLine).toContain("EM Residents Schedule");
    expect(schedule.titleLine).toContain("March 2026");
  });

  it("produces one Assignment per name, including for multi-name cells", () => {
    expect(schedule.assignments.length).toBe(11);
  });

  it("splits a multi-name cell into one Assignment per resident", () => {
    const names = schedule.assignments
      .filter((a) => a.shiftLabel === "Trauma TT 6a" && a.date === "2026-03-03")
      .map((a) => a.personName)
      .sort();
    expect(names).toEqual(["Jack Jones", "Kara King"]);
  });

  it("produces no Assignment for empty cells", () => {
    const empties = schedule.assignments.filter(
      (a) => a.shiftLabel === "H Medi MED ND 10p",
    );
    expect(empties).toHaveLength(0);
  });

  it("computes a 9h end for a 6am shift", () => {
    const a = schedule.assignments.find(
      (x) => x.personName === "Alice Adams",
    )!;
    expect(a.startDt.getHours()).toBe(6);
    expect(a.endDt.getTime() - a.startDt.getTime()).toBe(9 * 60 * 60 * 1000);
  });

  it("computes a midnight-crossing end for a 10pm shift", () => {
    const a = schedule.assignments.find(
      (x) => x.shiftLabel === "UW ED UW SD 10p" && x.date === "2026-03-05",
    )!;
    expect(a.startDt.getHours()).toBe(22);
    expect(a.endDt.getDate()).toBe(6); // next day
    expect(a.endDt.getHours()).toBe(7); // 10pm + 9h
  });

  it("computes a 24h end for a Risk shift", () => {
    const risk = schedule.assignments.find(
      (x) => x.shiftLabel === "Risk Senior",
    )!;
    expect(risk.endDt.getTime() - risk.startDt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });
});

describe("listPeople / listShiftsForPerson — synthetic sample", () => {
  it("lists every resident, alphabetized", () => {
    const people = listPeople(schedule);
    expect(people).toEqual([
      "Alice Adams",
      "Bob Brown",
      "Carol Chen",
      "Dan Davis",
      "Erin Evans",
      "Fay Ford",
      "Gail Green",
      "Henry Hall",
      "Ivy Irwin",
      "Jack Jones",
      "Kara King",
    ]);
  });

  it("returns only the named resident's shifts", () => {
    const shifts = listShiftsForPerson(schedule, "Alice Adams");
    expect(shifts).toHaveLength(1);
    expect(shifts[0].shiftLabel).toBe("UW ED UW SD 6a");
    expect(shifts[0].date).toBe("2026-03-01");
  });
});

describe("findSwapCandidates — synthetic sample", () => {
  const aliceShift = listShiftsForPerson(schedule, "Alice Adams")[0];

  it("returns exactly the senior-pool residents who can take Alice's shift", () => {
    const candidates = findSwapCandidates(aliceShift, schedule);
    const people = candidates.map((c) => c.candidatePerson);
    // Bob (UW SD), Carol (Trauma TD), Ivy (UW SD) are all the senior pool,
    // each with a single, non-conflicting shift on another day.
    expect(people).toEqual(["Bob Brown", "Carol Chen", "Ivy Irwin"]);
  });

  it("never includes the requester or out-of-pool residents", () => {
    const people = findSwapCandidates(aliceShift, schedule).map(
      (c) => c.candidatePerson,
    );
    expect(people).not.toContain("Alice Adams"); // requester
    expect(people).not.toContain("Dan Davis"); // junior pool
    expect(people).not.toContain("Fay Ford"); // non-dyad pool
    expect(people).not.toContain("Gail Green"); // SCH pool
    expect(people).not.toContain("Henry Hall"); // on Risk (non-swappable)
    expect(people).not.toContain("Jack Jones"); // trauma-team pool
  });

  it("only returns swap-class-compatible candidate shifts", () => {
    const req = getShift(aliceShift.shiftLabel);
    for (const c of findSwapCandidates(aliceShift, schedule)) {
      expect(shiftsAreSwappable(req, getShift(c.candidateShift.shiftLabel))).toBe(
        true,
      );
    }
  });

  it("returns no candidates for a non-swappable Risk shift", () => {
    const risk = schedule.assignments.find(
      (a) => a.shiftLabel === "Risk Senior",
    )!;
    expect(findSwapCandidates(risk, schedule)).toEqual([]);
  });
});

describe("isValidSwap — synthetic sample", () => {
  const aliceShift = listShiftsForPerson(schedule, "Alice Adams")[0];
  const bobShift = listShiftsForPerson(schedule, "Bob Brown")[0]; // senior
  const danShift = listShiftsForPerson(schedule, "Dan Davis")[0]; // junior

  it("accepts a valid same-pool swap on non-conflicting days", () => {
    expect(isValidSwap(aliceShift, bobShift, schedule)).toBe(true);
  });

  it("rejects a cross-pool swap (senior ↔ junior)", () => {
    expect(isValidSwap(aliceShift, danShift, schedule)).toBe(false);
  });
});
