/**
 * Swap-eligibility rules. Pure functions over Assignment data; no I/O, no
 * framework. The finder composes these into a candidate search.
 *
 * Rules implemented (from rules.txt, as interpreted in CLAUDE.md):
 *   - Level / swap-class matching (rule 2; rule 3 dropped as typo).
 *   - Rest window: shift length X requires X hours off before and after.
 *     When two shifts of different lengths are adjacent, the larger length
 *     wins — the gap between them must be ≥ max(L_a, L_b).
 *   - Risk shifts cannot be swapped, but they block the resident from any
 *     concurrent work (rule 8). Same for H Medi Clinic and Risk Senior Back
 *     Up, per CLAUDE.md decisions.
 *   - The candidate shift cannot be at the same time as the original
 *     (rule 9).
 */

import type { Assignment, Schedule } from "./types";
import { getShift, shiftsAreSwappable } from "./shifts";

/** Unique key for an Assignment — used to exclude "the shift being swapped out" from rest/conflict checks. */
export function assignmentKey(a: Assignment): string {
  return `${a.date}|${a.shiftLabel}|${a.personName}`;
}

/** Half-open interval overlap test: [aStart, aEnd) ∩ [bStart, bEnd) ≠ ∅. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Can `person` work `target` without violating overlap or rest constraints?
 *
 * If `ignore` is provided (the assignment the person is dropping in the
 * swap), it is excluded from the conflict and rest checks.
 */
export function canTakeShift(
  person: string,
  target: Pick<Assignment, "startDt" | "endDt"> & { lengthHours: number },
  schedule: Schedule,
  ignore?: Assignment,
): boolean {
  const ignoreKey = ignore ? assignmentKey(ignore) : null;

  for (const other of schedule.assignments) {
    if (other.personName !== person) continue;
    if (ignoreKey !== null && assignmentKey(other) === ignoreKey) continue;

    // Overlap → can't work two places at once.
    if (
      intervalsOverlap(
        other.startDt,
        other.endDt,
        target.startDt,
        target.endDt,
      )
    ) {
      return false;
    }

    // Rest gap. Use max(target length, other length) as the required gap.
    const otherLen = getShift(other.shiftLabel).lengthHours;
    const requiredRestMs =
      Math.max(target.lengthHours, otherLen) * 60 * 60 * 1000;

    let gap: number;
    if (other.endDt.getTime() <= target.startDt.getTime()) {
      gap = target.startDt.getTime() - other.endDt.getTime();
    } else if (target.endDt.getTime() <= other.startDt.getTime()) {
      gap = other.startDt.getTime() - target.endDt.getTime();
    } else {
      // Unreachable: overlap was checked above.
      return false;
    }

    if (gap < requiredRestMs) return false;
  }

  return true;
}

/**
 * Is the proposed swap (requesterShift ↔ candidateShift) valid?
 *
 * Both directions are checked: the requester must be able to take the
 * candidate's shift, and the candidate must be able to take the requester's
 * shift, after the swap takes effect.
 */
export function isValidSwap(
  requesterShift: Assignment,
  candidateShift: Assignment,
  schedule: Schedule,
): boolean {
  if (requesterShift.personName === candidateShift.personName) return false;

  // Rule 9: same time disallowed.
  if (
    requesterShift.startDt.getTime() === candidateShift.startDt.getTime() &&
    requesterShift.endDt.getTime() === candidateShift.endDt.getTime()
  ) {
    return false;
  }

  const reqCatalog = getShift(requesterShift.shiftLabel);
  const candCatalog = getShift(candidateShift.shiftLabel);

  // Rule 2: swap class must match (and both must be swappable).
  if (!shiftsAreSwappable(reqCatalog, candCatalog)) return false;

  // Requester takes candidate's shift, dropping their own.
  if (
    !canTakeShift(
      requesterShift.personName,
      {
        startDt: candidateShift.startDt,
        endDt: candidateShift.endDt,
        lengthHours: candCatalog.lengthHours,
      },
      schedule,
      requesterShift,
    )
  ) {
    return false;
  }

  // Candidate takes requester's shift, dropping their own.
  if (
    !canTakeShift(
      candidateShift.personName,
      {
        startDt: requesterShift.startDt,
        endDt: requesterShift.endDt,
        lengthHours: reqCatalog.lengthHours,
      },
      schedule,
      candidateShift,
    )
  ) {
    return false;
  }

  return true;
}
