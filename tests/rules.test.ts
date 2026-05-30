import { describe, it, expect } from "vitest";
import {
  canTakeShift,
  intervalsOverlap,
  isValidSwap,
} from "../src/lib/swapper/rules";
import type { Assignment, Schedule } from "../src/lib/swapper/types";
import { getShift } from "../src/lib/swapper/shifts";

function mkAssignment(
  date: string,
  shiftLabel: string,
  personName: string,
): Assignment {
  const catalog = getShift(shiftLabel);
  const [y, m, d] = date.split("-").map(Number);
  const startDt = new Date(y, m - 1, d, catalog.startHour, 0, 0, 0);
  const endDt = new Date(
    startDt.getTime() + catalog.lengthHours * 60 * 60 * 1000,
  );
  return { date, shiftLabel, personName, startDt, endDt };
}

function mkSchedule(assignments: Assignment[]): Schedule {
  return { year: 2026, month: 7, titleLine: "test", assignments };
}

function targetOf(a: Assignment) {
  return {
    startDt: a.startDt,
    endDt: a.endDt,
    lengthHours: getShift(a.shiftLabel).lengthHours,
  };
}

describe("intervalsOverlap", () => {
  it("returns true for overlapping intervals", () => {
    expect(
      intervalsOverlap(
        new Date(2026, 6, 1, 6),
        new Date(2026, 6, 1, 15),
        new Date(2026, 6, 1, 10),
        new Date(2026, 6, 1, 14),
      ),
    ).toBe(true);
  });

  it("returns false for touching but non-overlapping intervals", () => {
    // [6, 15) and [15, 20) — half-open
    expect(
      intervalsOverlap(
        new Date(2026, 6, 1, 6),
        new Date(2026, 6, 1, 15),
        new Date(2026, 6, 1, 15),
        new Date(2026, 6, 1, 20),
      ),
    ).toBe(false);
  });
});

describe("canTakeShift", () => {
  it("returns true when the person has no assignments at all", () => {
    const target = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
    expect(canTakeShift("Alice", targetOf(target), mkSchedule([]))).toBe(true);
  });

  it("returns false on overlap with an existing shift", () => {
    // Alice already has a 6a-3p shift. Target is also 6a-3p (different label, same time).
    const prior = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
    const target = mkAssignment("2026-07-01", "H Medi MED SD 6a", "x");
    expect(
      canTakeShift("Alice", targetOf(target), mkSchedule([prior])),
    ).toBe(false);
  });

  it("returns true when previous shift ends exactly shift-length hours before target", () => {
    // Prior shift Jun 30 10pm → Jul 1 7am (9h). Target Jul 1 4pm — gap exactly 9h.
    const prior = mkAssignment("2026-06-30", "UW ED UW SD 10p", "Alice");
    const target = {
      startDt: new Date(2026, 6, 1, 16, 0, 0, 0),
      endDt: new Date(2026, 6, 2, 1, 0, 0, 0),
      lengthHours: 9,
    };
    expect(canTakeShift("Alice", target, mkSchedule([prior]))).toBe(true);
  });

  it("returns false when previous shift ends less than shift-length hours before target", () => {
    // Prior Jul 1 6a-3p; target starts 3p+1h=4pm same day → gap 1h, way short of 9h.
    const prior = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
    const target = {
      startDt: new Date(2026, 6, 1, 16, 0, 0, 0),
      endDt: new Date(2026, 6, 2, 1, 0, 0, 0),
      lengthHours: 9,
    };
    expect(canTakeShift("Alice", target, mkSchedule([prior]))).toBe(false);
  });

  it("returns false when next shift starts less than shift-length hours after target", () => {
    // Next shift Jul 2 2pm-11pm; target Jul 1 10pm - Jul 2 7am. Gap 7h, need 9h.
    const next = mkAssignment("2026-07-02", "UW ED UW SD 2p", "Alice");
    const target = {
      startDt: new Date(2026, 6, 1, 22, 0, 0, 0),
      endDt: new Date(2026, 6, 2, 7, 0, 0, 0),
      lengthHours: 9,
    };
    expect(canTakeShift("Alice", target, mkSchedule([next]))).toBe(false);
  });

  it("uses max(target.length, other.length) for the rest gap", () => {
    // Risk is 24h. Even a 9h target needs 24h gap from a Risk shift.
    // Risk Jul 1: 6am Jul 1 → 6am Jul 2. Target Jul 2 starts at 2pm (8h after Risk ends) → fail.
    const risk = mkAssignment("2026-07-01", "Risk Senior", "Alice");
    const target = mkAssignment("2026-07-02", "UW ED UW SD 2p", "x"); // 2pm-11pm Jul 2
    expect(
      canTakeShift("Alice", targetOf(target), mkSchedule([risk])),
    ).toBe(false);
  });

  it("excludes the `ignore` assignment from conflict and rest checks", () => {
    // Alice has a 6a shift and we're considering taking it (i.e., she is in the swap).
    const own = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
    // Without ignore: same-time conflict — false. With ignore: vacuously true.
    expect(canTakeShift("Alice", targetOf(own), mkSchedule([own]))).toBe(false);
    expect(
      canTakeShift("Alice", targetOf(own), mkSchedule([own]), own),
    ).toBe(true);
  });
});

describe("isValidSwap", () => {
  // Two distant shifts, both senior pool, no other commitments.
  const seniorReq = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
  const seniorCand = mkAssignment("2026-07-15", "H Medi MED SD 2p", "Bob");

  it("accepts a valid swap with no other commitments", () => {
    expect(isValidSwap(seniorReq, seniorCand, mkSchedule([seniorReq, seniorCand]))).toBe(true);
  });

  it("rejects a swap with the same person on both sides", () => {
    const reqA = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
    const reqB = mkAssignment("2026-07-15", "H Medi MED SD 2p", "Alice");
    expect(isValidSwap(reqA, reqB, mkSchedule([reqA, reqB]))).toBe(false);
  });

  it("rejects a cross-pool swap (senior vs junior)", () => {
    const jr = mkAssignment("2026-07-15", "H Medi MED JD 2p", "Bob");
    expect(isValidSwap(seniorReq, jr, mkSchedule([seniorReq, jr]))).toBe(false);
  });

  it("rejects swapping into a Risk shift (Risk is not swappable)", () => {
    const risk = mkAssignment("2026-07-15", "Risk Senior", "Bob");
    expect(isValidSwap(seniorReq, risk, mkSchedule([seniorReq, risk]))).toBe(false);
  });

  it("rejects when the two shifts are at the same time (rule 9)", () => {
    const a = mkAssignment("2026-07-01", "UW ED UW SD 6a", "Alice");
    const b = mkAssignment("2026-07-01", "H Medi MED SD 6a", "Bob");
    expect(isValidSwap(a, b, mkSchedule([a, b]))).toBe(false);
  });

  it("rejects when the candidate has a conflict with the requester's shift", () => {
    // Bob already has a Risk on Jul 1 (24h), so he can't take Alice's Jul 1 6a shift.
    const bobRisk = mkAssignment("2026-07-01", "Risk Senior", "Bob");
    expect(isValidSwap(seniorReq, seniorCand, mkSchedule([seniorReq, seniorCand, bobRisk]))).toBe(false);
  });

  it("rejects when the requester has a conflict with the candidate's shift", () => {
    // Alice already has a Risk on Jul 15.
    const aliceRisk = mkAssignment("2026-07-15", "Risk Senior", "Alice");
    expect(isValidSwap(seniorReq, seniorCand, mkSchedule([seniorReq, seniorCand, aliceRisk]))).toBe(false);
  });

  it("accepts TD ↔ SD swaps (senior pool spans TD/SD/R4)", () => {
    const td = mkAssignment("2026-07-01", "Trauma TD 6 am", "Alice");
    const sd = mkAssignment("2026-07-15", "UW ED UW SD 2p", "Bob");
    expect(isValidSwap(td, sd, mkSchedule([td, sd]))).toBe(true);
  });

  it("accepts HMC R4 (Trauma T SR) ↔ SD swaps", () => {
    const r4 = mkAssignment("2026-07-01", "Trauma T SR 6a", "Alice");
    const sd = mkAssignment("2026-07-15", "H Medi MED SD 2p", "Bob");
    expect(isValidSwap(r4, sd, mkSchedule([r4, sd]))).toBe(true);
  });

  it("rejects SCH ↔ senior (different pools)", () => {
    const sch = mkAssignment("2026-07-01", "SCH SCH 6am", "Alice");
    expect(isValidSwap(sch, seniorCand, mkSchedule([sch, seniorCand]))).toBe(false);
  });
});
