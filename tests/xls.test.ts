/**
 * Verifies that opening the month as an Excel workbook (.xls / .xlsx) yields
 * the same schedule as the CSV. The conversion (SheetJS → CSV text) lives in
 * src/platform.ts; the parser is identical for both paths.
 *
 * Uses the real July 2026 fixture, which is git-ignored (resident names), so
 * this skips in CI / fresh clones and runs in full locally.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSchedule } from "../src/lib/swapper/parser";
import { spreadsheetToCsv } from "../src/platform";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "..", "fixtures", "schedule_141955_d4hqth5sqw.csv");
const XLS_PATH = join(__dirname, "..", "fixtures", "schedule_141955_d4hqth5sqw.xls");
const hasFixtures = existsSync(CSV_PATH) && existsSync(XLS_PATH);

describe.skipIf(!hasFixtures)("spreadsheetToCsv — .xls matches .csv", () => {
  it("parses to a schedule equivalent to the CSV", async () => {
    const fromCsv = parseSchedule(readFileSync(CSV_PATH, "utf-8"));

    const buf = readFileSync(XLS_PATH);
    const bytes = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
    const fromXls = parseSchedule(await spreadsheetToCsv(bytes));

    expect(fromXls.year).toBe(fromCsv.year);
    expect(fromXls.month).toBe(fromCsv.month);

    // Same set of (date, shift, person) assignments — including multi-name
    // cells, which only round-trip correctly if in-cell line breaks survive.
    const key = (a: { date: string; shiftLabel: string; personName: string }) =>
      `${a.date}|${a.shiftLabel}|${a.personName}`;
    const csvSet = new Set(fromCsv.assignments.map(key));
    const xlsSet = new Set(fromXls.assignments.map(key));
    expect(xlsSet).toEqual(csvSet);
  });
});
