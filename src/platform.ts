/**
 * Browser-only platform helpers — opening a CSV and remembering the last
 * filename. The schedule itself never leaves the user's browser.
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

export function openCsv(): Promise<OpenResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve({ path: file.name, text });
      } catch {
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
