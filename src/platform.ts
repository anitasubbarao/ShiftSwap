/**
 * Browser-only platform helpers — opening a schedule file and remembering the
 * last filename. The schedule itself never leaves the user's browser.
 *
 * Accepts the monthly CSV directly, or an Excel workbook (.xls / .xlsx) which
 * is converted to CSV in-browser so the rest of the app (parser, finder) only
 * ever deals with CSV text.
 *
 * Browsers can't reopen a file by path without a fresh user gesture, so
 * "recall" just returns the last-used filename for display; the user has
 * to click the open button to pick it again.
 */

export interface OpenResult {
  path: string;
  text: string;
}

const LS_KEY_LAST = "shiftswap:lastOpenedFileName";

/** True for Excel workbook filenames (.xls or .xlsx). */
function isSpreadsheet(filename: string): boolean {
  return /\.xlsx?$/i.test(filename);
}

/**
 * Convert an Excel workbook's first sheet to CSV text, matching the layout the
 * parser expects. SheetJS is imported dynamically so it's only downloaded when
 * a user actually opens a spreadsheet — CSV users never pay for it, and it
 * lands in its own bundle chunk rather than the main one.
 */
export async function spreadsheetToCsv(bytes: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) {
    throw new Error("The spreadsheet contains no sheets.");
  }
  // blankrows keeps empty rows so the parser's week-block detection lines up.
  return XLSX.utils.sheet_to_csv(wb.Sheets[firstSheet], { blankrows: true });
}

export function openCsv(): Promise<OpenResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.xls,.xlsx,text/csv";
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = isSpreadsheet(file.name)
          ? await spreadsheetToCsv(await file.arrayBuffer())
          : await file.text();
        resolve({ path: file.name, text });
      } catch (err) {
        // Unreadable file or a corrupt workbook — surface for debugging, but
        // resolve null so the caller can show its normal "couldn't open" path.
        console.error("Failed to read schedule file:", err);
        resolve(null);
      }
    };
    document.body.appendChild(input);
    input.click();
  });
}

export async function rememberPath(path: string): Promise<void> {
  try {
    localStorage.setItem(LS_KEY_LAST, path);
  } catch {
    // private browsing, storage full, etc — non-fatal.
  }
}

/**
 * Browsers can't silently re-read a file by name. Returns null; the UI just
 * shows the last filename as a hint.
 */
export async function recallAndReopen(): Promise<OpenResult | null> {
  return null;
}
