/**
 * Swap-candidate finder. Public API the UI consumes.
 *
 *   findSwapCandidates(requesterShift, schedule) → list of all other shifts
 *   the requester could legally swap into.
 *
 * Plus a couple of small UI conveniences (listPeople, listShiftsForPerson).
 */

import type { Assignment, Schedule, SwapCandidate } from "./types";
import { assignmentKey, isValidSwap } from "./rules";

/** All unique people in the schedule, alphabetized. */
export function listPeople(schedule: Schedule): string[] {
  const seen = new Set<string>();
  for (const a of schedule.assignments) seen.add(a.personName);
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/** All assignments for a given person, sorted by start time. */
export function listShiftsForPerson(
  schedule: Schedule,
  personName: string,
): Assignment[] {
  return schedule.assignments
    .filter((a) => a.personName === personName)
    .sort((a, b) => a.startDt.getTime() - b.startDt.getTime());
}

/**
 * All assignments the requester could swap their `requesterShift` for,
 * subject to the swap rules. Returned candidates are deduplicated by the
 * candidate's (date, shiftLabel, personName) key.
 */
export function findSwapCandidates(
  requesterShift: Assignment,
  schedule: Schedule,
): SwapCandidate[] {
  const requesterKey = assignmentKey(requesterShift);
  const seen = new Set<string>();
  const candidates: SwapCandidate[] = [];

  for (const other of schedule.assignments) {
    if (other.personName === requesterShift.personName) continue;
    const otherKey = assignmentKey(other);
    if (otherKey === requesterKey) continue;
    if (seen.has(otherKey)) continue;

    if (isValidSwap(requesterShift, other, schedule)) {
      seen.add(otherKey);
      candidates.push({
        candidatePerson: other.personName,
        candidateShift: other,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      a.candidatePerson.localeCompare(b.candidatePerson) ||
      a.candidateShift.startDt.getTime() - b.candidateShift.startDt.getTime(),
  );

  return candidates;
}

/**
 * Group swap candidates by candidate person, preserving the per-person time
 * ordering produced by `findSwapCandidates`. Returned array is alphabetical
 * by person name.
 */
export function groupCandidatesByPerson(
  candidates: SwapCandidate[],
): { person: string; shifts: Assignment[] }[] {
  const byPerson = new Map<string, Assignment[]>();
  for (const c of candidates) {
    const list = byPerson.get(c.candidatePerson);
    if (list) list.push(c.candidateShift);
    else byPerson.set(c.candidatePerson, [c.candidateShift]);
  }
  return Array.from(byPerson.entries())
    .map(([person, shifts]) => ({ person, shifts }))
    .sort((a, b) => a.person.localeCompare(b.person));
}
