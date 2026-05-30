import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchedule, CsvFormatError } from "../src/lib/swapper/parser";
import { UnknownShiftLabelError } from "../src/lib/swapper/shifts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(
  __dirname,
  "..",
  "fixtures",
  "schedule_141955_d4hqth5sqw.csv",
);

// fixtures/ is git-ignored (it holds resident names), so the CSV may be absent
// on a fresh clone or in CI. When missing, the fixture-backed suite below skips;
// it runs in full locally where the CSV is present. The error-case suite never
// needs the fixture and always runs.
const hasFixture = existsSync(FIXTURE_PATH);
const fixtureCsv = hasFixture ? readFileSync(FIXTURE_PATH, "utf-8") : "";

describe.skipIf(!hasFixture)("parseSchedule — July 2026 fixture", () => {
  const schedule = hasFixture
    ? parseSchedule(fixtureCsv)
    : (undefined as unknown as ReturnType<typeof parseSchedule>);

  it("extracts year and month from title row", () => {
    expect(schedule.year).toBe(2026);
    expect(schedule.month).toBe(7);
  });

  it("produces a non-trivial number of assignments", () => {
    expect(schedule.assignments.length).toBeGreaterThan(500);
  });

  it("includes a known single-name cell (Addison Sparks, Trauma TD 6 am, Wed July 1)", () => {
    const match = schedule.assignments.find(
      (a) =>
        a.personName === "Addison Sparks" &&
        a.shiftLabel === "Trauma TD 6 am" &&
        a.date === "2026-07-01",
    );
    expect(match).toBeDefined();
  });

  it("splits multi-name cells into one Assignment per name", () => {
    const ttSixAJuly1 = schedule.assignments.filter(
      (a) => a.shiftLabel === "Trauma TT 6a" && a.date === "2026-07-01",
    );
    const names = ttSixAJuly1.map((a) => a.personName).sort();
    expect(names).toEqual(["Alex Poniz", "Dario G. Hernandez"]);
  });

  it("computes start/end datetimes correctly for a 9h shift", () => {
    const match = schedule.assignments.find(
      (a) =>
        a.personName === "Addison Sparks" &&
        a.shiftLabel === "Trauma TD 6 am" &&
        a.date === "2026-07-01",
    );
    expect(match).toBeDefined();
    expect(match!.startDt.getFullYear()).toBe(2026);
    expect(match!.startDt.getMonth()).toBe(6); // 0-indexed → July
    expect(match!.startDt.getDate()).toBe(1);
    expect(match!.startDt.getHours()).toBe(6);
    expect(match!.endDt.getTime() - match!.startDt.getTime()).toBe(
      9 * 60 * 60 * 1000,
    );
  });

  it("computes 24h end for a Risk shift", () => {
    const risk = schedule.assignments.find(
      (a) => a.shiftLabel === "Risk Senior" && a.date === "2026-07-01",
    );
    expect(risk).toBeDefined();
    expect(risk!.endDt.getTime() - risk!.startDt.getTime()).toBe(
      24 * 60 * 60 * 1000,
    );
  });

  it("computes correct end for a 10pm shift (crosses midnight)", () => {
    const pm10 = schedule.assignments.find(
      (a) => a.shiftLabel === "UW ED UW SD 10p" && a.date === "2026-07-01",
    );
    expect(pm10).toBeDefined();
    expect(pm10!.startDt.getHours()).toBe(22);
    // 10pm + 9h = 7am next day
    expect(pm10!.endDt.getDate()).toBe(2);
    expect(pm10!.endDt.getHours()).toBe(7);
  });

  it("produces no Assignment for empty cells", () => {
    // H Medi MED ND 10p on Mon July 6 is empty in the CSV.
    const empty = schedule.assignments.find(
      (a) =>
        a.shiftLabel === "H Medi MED ND 10p" && a.date === "2026-07-06",
    );
    expect(empty).toBeUndefined();
  });

  it("covers all 31 days of July 2026", () => {
    const days = new Set(schedule.assignments.map((a) => a.date));
    expect(days.size).toBe(31);
    expect(days.has("2026-07-01")).toBe(true);
    expect(days.has("2026-07-31")).toBe(true);
  });

  it("preserves the original title line", () => {
    expect(schedule.titleLine).toContain("EM Residents Schedule");
    expect(schedule.titleLine).toContain("July 2026");
  });
});

describe("parseSchedule — error cases", () => {
  it("raises UnknownShiftLabelError on an unknown shift row", () => {
    const bad = [
      "Table 1",
      "EM Residents Schedule - July 2026,,,,,,,",
      "Shifts,Sun,Mon,Tue,Wed,Thu,Fri,Sat",
      ",,,,1,2,3,4",
      "Made Up Shift Label,,,,Bob,,,",
    ].join("\n");
    expect(() => parseSchedule(bad)).toThrow(UnknownShiftLabelError);
  });

  it("raises CsvFormatError when the title row is missing", () => {
    const bad = [
      "Shifts,Sun,Mon,Tue,Wed,Thu,Fri,Sat",
      ",,,,1,2,3,4",
    ].join("\n");
    expect(() => parseSchedule(bad)).toThrow(CsvFormatError);
  });
});
