/**
 * Static catalog of every shift label observed in the July 2026 reference
 * CSV, mapped to its metadata. The label string is the contract between the
 * CSV and the catalog — if a future month's CSV introduces a new label, the
 * parser raises rather than silently mis-routing.
 *
 * Notes on classifications:
 *   - HMC R4 shifts appear in the CSV as "Trauma T SR" rows. They are
 *     senior-equivalent for swap purposes (decided in CLAUDE.md).
 *   - SCH (Seattle Children's) is its own swap pool — SCH ↔ SCH only.
 *   - Risk shifts and H Medi Clinic are non-swappable. They block the
 *     resident from concurrent work for their full duration.
 *   - Clinic time-of-day is unspecified in rules.txt; conservatively
 *     modeled as a 24-hour block starting at 6am so a person on Clinic is
 *     treated as unavailable that calendar day.
 */

import type { ShiftCatalogEntry, ShiftType, SwapClass } from "./types";

function e(
  label: string,
  type: ShiftType,
  level: string,
  startHour: number,
  lengthHours: number,
  swapClass: SwapClass | null,
  blocker = false,
): ShiftCatalogEntry {
  return { label, type, level, startHour, lengthHours, swapClass, blocker };
}

const entries: ShiftCatalogEntry[] = [
  // Trauma Docs — senior pool
  e("Trauma TD 6 am", "Trauma", "Trauma Doc", 6, 9, "senior"),
  e("Trauma TD 2 pm", "Trauma", "Trauma Doc", 14, 9, "senior"),
  e("Trauma TD 10 pm", "Trauma", "Trauma Doc", 22, 9, "senior"),

  // Trauma Team — its own pool
  e("Trauma TT 6a", "Trauma", "Trauma Team", 6, 9, "trauma-team"),
  e("Trauma TT 2p", "Trauma", "Trauma Team", 14, 9, "trauma-team"),
  e("Trauma TT 10p", "Trauma", "Trauma Team", 22, 9, "trauma-team"),

  // H Medi Senior Docs — senior pool
  e("H Medi MED SD 6a", "H Medi", "Medicine Senior Doc", 6, 9, "senior"),
  e("H Medi MED SD 2p", "H Medi", "Medicine Senior Doc", 14, 9, "senior"),
  e("H Medi MED SD 10p", "H Medi", "Medicine Senior Doc", 22, 9, "senior"),

  // H Medi Junior Docs — junior pool
  e("H Medi MED JD 6a", "H Medi", "Medicine Junior Doc", 6, 9, "junior"),
  e("H Medi MED JD 2p", "H Medi", "Medicine Junior Doc", 14, 9, "junior"),
  e("H Medi MED JD 10p", "H Medi", "Medicine Junior Doc", 22, 9, "junior"),

  // H Medi Non-Dyad
  e("H Medi MED ND 10a", "H Medi", "Medicine Non-Dyad", 10, 9, "non-dyad"),
  e("H Medi MED ND 5p", "H Medi", "Medicine Non-Dyad", 17, 9, "non-dyad"),
  e("H Medi MED ND 10p", "H Medi", "Medicine Non-Dyad", 22, 9, "non-dyad"),

  // H Medi Clinic — non-swappable full-day block
  e("H Medi Clinic", "H Medi", "Clinic", 6, 24, null, true),

  // HMC R4 — appears as "Trauma T SR" in the CSV. Senior-equivalent.
  e("Trauma T SR 6a", "HMC", "R4", 6, 9, "senior"),
  e("Trauma T SR 2p", "HMC", "R4", 14, 9, "senior"),
  e("Trauma T SR 10p", "HMC", "R4", 22, 9, "senior"),

  // Seattle Children's — 10h shifts, SCH-only pool
  e("SCH SCH 6am", "SCH", "Seattle Children's", 6, 10, "sch"),
  e("SCH SCH 10am", "SCH", "Seattle Children's", 10, 10, "sch"),
  e("SCH SCH 7pm", "SCH", "Seattle Children's", 19, 10, "sch"),
  e("SCH SCH 10pm", "SCH", "Seattle Children's", 22, 10, "sch"),

  // UW ED Senior Docs — senior pool
  e("UW ED UW SD 6a", "UW ED", "UW Senior Doc", 6, 9, "senior"),
  e("UW ED UW SD 2p", "UW ED", "UW Senior Doc", 14, 9, "senior"),
  e("UW ED UW SD 10p", "UW ED", "UW Senior Doc", 22, 9, "senior"),

  // UW ED Junior Docs — junior pool
  e("UW ED UW JD 6a", "UW ED", "UW Junior Doc", 6, 9, "junior"),
  e("UW ED UW JD 2p", "UW ED", "UW Junior Doc", 14, 9, "junior"),
  e("UW ED UW JD 10p", "UW ED", "UW Junior Doc", 22, 9, "junior"),

  // UW ED Non-Dyad
  e("UW ED UW ND 10a", "UW ED", "UW Non-Dyad", 10, 9, "non-dyad"),
  e("UW ED UW ND 3p", "UW ED", "UW Non-Dyad", 15, 9, "non-dyad"),
  e("UW ED UW ND 5p", "UW ED", "UW Non-Dyad", 17, 9, "non-dyad"),
  e("UW ED UW ND 10p", "UW ED", "UW Non-Dyad", 22, 9, "non-dyad"),

  // Risk — 24h, non-swappable, full-day blocker for the resident
  e("Risk Senior", "Risk", "Risk Senior", 6, 24, null, true),
  e("Risk Intern", "Risk", "Risk Intern", 6, 24, null, true),
  e("Risk Senior Back Up", "Risk", "Risk Senior Back Up", 6, 24, null, true),
];

export const SHIFT_CATALOG: ReadonlyMap<string, ShiftCatalogEntry> = new Map(
  entries.map((entry) => [entry.label, entry]),
);

export class UnknownShiftLabelError extends Error {
  constructor(public readonly label: string) {
    super(
      `Unknown shift label: ${JSON.stringify(label)}. ` +
        `Add it to SHIFT_CATALOG in src/lib/swapper/shifts.ts.`,
    );
    this.name = "UnknownShiftLabelError";
  }
}

/** Look up a shift by label; throws if unknown. */
export function getShift(label: string): ShiftCatalogEntry {
  const entry = SHIFT_CATALOG.get(label);
  if (!entry) throw new UnknownShiftLabelError(label);
  return entry;
}

/** Two shifts are swappable iff both are in the same (non-null) swap pool. */
export function shiftsAreSwappable(
  a: ShiftCatalogEntry,
  b: ShiftCatalogEntry,
): boolean {
  return a.swapClass !== null && a.swapClass === b.swapClass;
}
