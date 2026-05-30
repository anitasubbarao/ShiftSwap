/**
 * Domain types for ShiftSwap. Framework-free — used by parser, rules,
 * finder, and the UI alike. A future hosted version would reuse these
 * verbatim as the API contract.
 */

/**
 * Equivalence classes for swap eligibility. Two shifts may be swapped iff
 * their swapClass values are non-null and equal.
 *
 * Pool membership (derived from rules.txt + decisions in CLAUDE.md):
 *   senior:      UW SD, H Medi SD, Trauma TD, HMC R4 (Trauma T SR)
 *   junior:      UW JD, H Medi JD
 *   trauma-team: Trauma TT
 *   non-dyad:    UW ND, H Medi ND
 *   sch:         Seattle Children's
 */
export type SwapClass =
  | "senior"
  | "junior"
  | "trauma-team"
  | "non-dyad"
  | "sch";

export type ShiftType =
  | "Trauma"
  | "H Medi"
  | "UW ED"
  | "HMC"
  | "SCH"
  | "Risk";

export interface ShiftCatalogEntry {
  /** Exact label as it appears in column 0 of the CSV. */
  label: string;
  type: ShiftType;
  /** Human-readable role level (e.g., "UW Senior Doc"). */
  level: string;
  /** Local start hour, 0-23. */
  startHour: number;
  /** Shift length in hours. */
  lengthHours: number;
  /** Swap pool, or null if the shift cannot be swapped (Risk, Clinic). */
  swapClass: SwapClass | null;
  /**
   * True if the shift blocks the person from concurrent work for its full
   * duration but is itself not swappable. Risk shifts and Clinic.
   */
  blocker: boolean;
}

/**
 * A specific person assigned to a specific shift on a specific date.
 * `startDt` / `endDt` are derived at parse time from the date + the shift
 * catalog entry.
 */
export interface Assignment {
  /** ISO date the shift starts (YYYY-MM-DD), interpreted in local time. */
  date: string;
  /** CSV shift label. Must exist in SHIFT_CATALOG or the parser raises. */
  shiftLabel: string;
  /** Person name exactly as written in the CSV. */
  personName: string;
  /** Local-time start. */
  startDt: Date;
  /** Local-time end. */
  endDt: Date;
}

export interface Schedule {
  year: number;
  /** 1-12. */
  month: number;
  /** Original CSV title line (for debugging / display). */
  titleLine: string;
  assignments: Assignment[];
}

/** A valid swap candidate returned by the finder. */
export interface SwapCandidate {
  /** The other person who would take the requester's shift. */
  candidatePerson: string;
  /** The shift the requester would take in return. */
  candidateShift: Assignment;
}
