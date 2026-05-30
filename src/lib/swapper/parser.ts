/**
 * CSV → Schedule parser. The CSV is the canonical month schedule format
 * produced by the medical center. Layout assumptions are documented in
 * CLAUDE.md ("Inputs").
 *
 * The parser is intentionally strict: unknown shift labels raise rather than
 * silently dropping rows, and a missing title row raises a CsvFormatError.
 * This catches month-to-month drift early.
 */

import Papa from "papaparse";
import type { Assignment, Schedule } from "./types";
import { getShift } from "./shifts";

export class CsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvFormatError";
  }
}

const MONTHS_BY_NAME: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function parseTitle(titleLine: string): { year: number; month: number } {
  // Example: "EM Residents Schedule - July 2026"
  const m = titleLine.match(/-\s*([A-Za-z]+)\s+(\d{4})/);
  if (!m) {
    throw new CsvFormatError(
      `Could not parse month/year from title line: ${JSON.stringify(titleLine)}`,
    );
  }
  const monthName = m[1].toLowerCase();
  const year = Number(m[2]);
  const month = MONTHS_BY_NAME[monthName];
  if (!month) {
    throw new CsvFormatError(`Unrecognized month name in title: ${monthName}`);
  }
  return { year, month };
}

function isWeekHeaderRow(cells: string[]): boolean {
  if ((cells[0] ?? "").trim() !== "") return false;
  for (let i = 1; i <= 7; i++) {
    const v = (cells[i] ?? "").trim();
    if (v === "") continue;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 1 && n <= 31) return true;
  }
  return false;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitNames(cell: string): string[] {
  return cell
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter((n) => n !== "");
}

export function parseSchedule(csvText: string): Schedule {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });
  const rows = parsed.data;

  let titleIdx = -1;
  let titleLine = "";
  for (let i = 0; i < rows.length; i++) {
    const first = (rows[i]?.[0] ?? "").trim();
    if (/EM Residents Schedule/i.test(first)) {
      titleIdx = i;
      titleLine = first;
      break;
    }
  }
  if (titleIdx === -1) {
    throw new CsvFormatError(
      "Title row not found (expected a row starting with 'EM Residents Schedule').",
    );
  }
  const { year, month } = parseTitle(titleLine);

  // Scan forward to the first week-header row.
  let cursor = titleIdx + 1;
  while (cursor < rows.length && !isWeekHeaderRow(rows[cursor] ?? [])) {
    cursor++;
  }

  const assignments: Assignment[] = [];

  while (cursor < rows.length) {
    const headerRow = rows[cursor] ?? [];
    if (!isWeekHeaderRow(headerRow)) {
      cursor++;
      continue;
    }

    // Map column index (1..7) → day-of-month, or null when that weekday is
    // outside the month (start/end of month padding).
    const dayByCol: (number | null)[] = [null];
    for (let i = 1; i <= 7; i++) {
      const v = (headerRow[i] ?? "").trim();
      const n = Number(v);
      const isDay = v !== "" && Number.isInteger(n) && n >= 1 && n <= 31;
      dayByCol.push(isDay ? n : null);
    }
    cursor++;

    // Walk shift rows until the next week-header or EOF.
    while (cursor < rows.length && !isWeekHeaderRow(rows[cursor] ?? [])) {
      const row = rows[cursor] ?? [];
      const label = (row[0] ?? "").trim();
      if (label === "") {
        cursor++;
        continue;
      }
      const catalog = getShift(label);

      for (let col = 1; col <= 7; col++) {
        const day = dayByCol[col];
        if (day === null) continue;
        const cell = (row[col] ?? "").trim();
        if (cell === "") continue;
        const date = isoDate(year, month, day);
        const startDt = new Date(
          year,
          month - 1,
          day,
          catalog.startHour,
          0,
          0,
          0,
        );
        const endDt = new Date(
          startDt.getTime() + catalog.lengthHours * 60 * 60 * 1000,
        );
        for (const personName of splitNames(cell)) {
          assignments.push({
            date,
            shiftLabel: label,
            personName,
            startDt: new Date(startDt.getTime()),
            endDt: new Date(endDt.getTime()),
          });
        }
      }
      cursor++;
    }
  }

  return { year, month, titleLine, assignments };
}
