/**
 * A character grid that frames are composed into before anything is written.
 * The frame is serialized with colour runs coalesced, so a full redraw is a
 * single write() and the terminal never tears mid-frame.
 */

export interface Cell {
  ch: string;
  color: string;
}

export type Grid = Cell[][];

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[90m",
  white: "\x1b[97m",
  red: "\x1b[91m",
  green: "\x1b[92m",
  yellow: "\x1b[93m",
  blue: "\x1b[94m",
  magenta: "\x1b[95m",
  cyan: "\x1b[96m",
  bold: "\x1b[1m",
};

/** Erase to end of line, so a shorter frame leaves no stale characters. */
const CLEAR_EOL = "\x1b[K";
/** Erase everything below the cursor, so a shorter frame leaves no old rows. */
const CLEAR_BELOW = "\x1b[J";

const RESET = COLORS.reset;

/** ANSI code for a theme colour name, or "" when the name is unknown. */
export function colorCode(name: string): string {
  return (COLORS as Record<string, string | undefined>)[name] ?? "";
}

export function paint(text: string, color: string): string {
  const code = colorCode(color);
  return code ? `${code}${text}${RESET}` : text;
}

export function makeGrid(width: number, height: number): Grid {
  const grid: Grid = [];
  for (let y = 0; y < height; y++) {
    const row: Cell[] = new Array(width);
    for (let i = 0; i < width; i++) row[i] = { ch: " ", color: "" };
    grid.push(row);
  }
  return grid;
}

export function put(grid: Grid, x: number, y: number, ch: string, color: string): void {
  const row = grid[y];
  if (!row) return;
  if (x < 0 || x >= row.length) return;
  row[x] = { ch, color };
}

export function putText(grid: Grid, x: number, y: number, text: string, color: string): void {
  // Iterate code points, not UTF-16 units, so ✻ and friends take one cell.
  let i = 0;
  for (const ch of text) put(grid, x + i++, y, ch, color);
}

/** Visible width of a string, one cell per code point. */
export function textWidth(text: string): number {
  return [...text].length;
}

export function putCentered(grid: Grid, y: number, text: string, color: string, left = 0, width?: number): void {
  const span = width ?? (grid[0]?.length ?? 0) - left;
  const x = left + Math.max(0, Math.floor((span - textWidth(text)) / 2));
  putText(grid, x, y, clip(text, span), color);
}

export function clip(text: string, width: number): string {
  const chars = [...text];
  return chars.length <= width ? text : chars.slice(0, Math.max(0, width)).join("");
}

/** A horizontal meter such as ████░░░░. */
export function putBar(
  grid: Grid,
  x: number,
  y: number,
  width: number,
  fraction: number,
  color: string,
  full: string,
  empty: string,
): void {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  for (let i = 0; i < width; i++) put(grid, x + i, y, i < filled ? full : empty, i < filled ? color : "dim");
}

/**
 * Clipped to the terminal: a frame wider or taller than a shrunken pane
 * would wrap and scroll into garbage.
 */
export function serialize(grid: Grid, columns: number, rows: number): string {
  const out: string[] = [];
  for (const row of grid.slice(0, Math.max(1, rows))) {
    let line = "";
    let current = "";
    for (const cell of row.slice(0, Math.max(1, columns))) {
      if (cell.color !== current) {
        if (current) line += RESET;
        const code = colorCode(cell.color);
        line += code;
        current = code ? cell.color : "";
      }
      line += cell.ch;
    }
    if (current) line += RESET;
    out.push(line + CLEAR_EOL);
  }
  return out.join("\r\n") + CLEAR_BELOW;
}
