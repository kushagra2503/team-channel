import { useEffect, useState } from 'react';

export function useGridColumnCount(): number {
  const [columns, setColumns] = useState(() => readGridColumns());

  useEffect(() => {
    const onResize = () => setColumns(readGridColumns());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return columns;
}

function readGridColumns(): number {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 1;
  if (window.matchMedia('(min-width: 1024px)').matches) return 3;
  if (window.matchMedia('(min-width: 640px)').matches) return 2;
  return 1;
}
