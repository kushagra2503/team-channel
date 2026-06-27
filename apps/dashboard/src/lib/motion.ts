/** Stagger delay for grid items: columns lead, rows follow within each column. */
export function gridStaggerDelay(
  index: number,
  columnCount: number,
  columnDelay = COLUMN_STAGGER,
  rowDelay = ROW_STAGGER
): number {
  const cols = Math.max(1, columnCount);
  const col = index % cols;
  const row = Math.floor(index / cols);
  return col * columnDelay + row * rowDelay;
}

/** Stagger delay for dashboard column children: left columns lead, rows follow within each column. */
export function columnStaggerDelay(
  columnIndex: number,
  itemIndex: number,
  columnDelay = COLUMN_STAGGER,
  rowDelay = ROW_STAGGER
): number {
  return columnIndex * columnDelay + itemIndex * rowDelay;
}

export const COLUMN_ENTER = { opacity: 1, y: 0 } as const;
export const COLUMN_HIDE = { opacity: 0, y: 6 } as const;
export const COLUMN_EASE = [0.23, 1, 0.32, 1] as const;
export const COLUMN_DURATION = 0.22;
export const COLUMN_STAGGER = 0.07;
export const ROW_STAGGER = 0.025;

export function columnEnterTransition(columnIndex: number, itemIndex: number) {
  return {
    duration: COLUMN_DURATION,
    ease: COLUMN_EASE,
    delay: columnStaggerDelay(columnIndex, itemIndex)
  } as const;
}
