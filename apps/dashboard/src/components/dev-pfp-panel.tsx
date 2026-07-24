import { useState } from 'react';
import { IconRefresh, IconSparkles } from '@tabler/icons-react';
import {
  buildCoordUrl,
  previewPfp,
  type PfpPreviewOptions,
  type CoordClientConfig
} from '@/api/coordClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Algorithm = PfpPreviewOptions['algorithm'];

const ALGORITHMS: { value: Algorithm; label: string }[] = [
  { value: 'floyd-steinberg', label: 'Floyd-Steinberg' },
  { value: 'atkinson', label: 'Atkinson' },
  { value: 'bayer', label: 'Bayer' }
];

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return { r: 0, g: 0, b: 0 };
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function randomHexColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 0.65;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  const m = l - c / 2;
  return rgbToHex({ r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) });
}

export function DevPfpPanel({ config }: { config: CoordClientConfig }) {
  const [query, setQuery] = useState('flower close up');
  const [size, setSize] = useState(220);
  const [algorithm, setAlgorithm] = useState<Algorithm>('bayer');
  const [bayerLevel, setBayerLevel] = useState(1);
  const [colorHex, setColorHex] = useState('#d742aa');
  const [seed, setSeed] = useState(() => String(Math.random()).slice(2));
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [source, setSource] = useState<string>();
  const [sourceUrl, setSourceUrl] = useState<string>();
  const [imageUrl, setImageUrl] = useState<string>();
  const [photographer, setPhotographer] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function generate() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await previewPfp(config, {
        query,
        size,
        algorithm,
        bayerLevel: algorithm === 'bayer' ? bayerLevel : undefined,
        color: hexToRgb(colorHex),
        seed
      });
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(result.blob);
      });
      setSource(result.source);
      setSourceUrl(result.sourceUrl || undefined);
      setImageUrl(result.imageUrl || undefined);
      setPhotographer(result.photographer || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate pfp');
    } finally {
      setLoading(false);
    }
  }

  const directPreviewUrl = buildCoordUrl('/dev/pfp/preview', config);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pfp-query">Pexels query</Label>
          <Input
            id="pfp-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="flower close up"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pfp-size">Size (px)</Label>
          <Input
            id="pfp-size"
            type="number"
            min={8}
            max={512}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pfp-algorithm">Algorithm</Label>
          <select
            id="pfp-algorithm"
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value as Algorithm)}
            className="h-9 rounded-md border border-input bg-input/20 px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {ALGORITHMS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {algorithm === 'bayer' ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pfp-bayer">Bayer level</Label>
            <Input
              id="pfp-bayer"
              type="number"
              min={0}
              max={4}
              value={bayerLevel}
              onChange={(e) => setBayerLevel(Number(e.target.value))}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pfp-color">Multiply color</Label>
          <div className="flex items-center gap-2">
            <input
              id="pfp-color"
              type="color"
              value={colorHex}
              onChange={(e) => setColorHex(e.target.value)}
              className="size-9 cursor-pointer rounded-md border border-input bg-transparent p-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setColorHex(randomHexColor())}
            >
              <IconRefresh /> Random
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pfp-seed">Seed</Label>
          <Input
            id="pfp-seed"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={generate} disabled={loading}>
          <IconSparkles /> {loading ? 'Generating…' : 'Generate'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setSeed(String(Math.random()).slice(2))}
        >
          <IconRefresh /> New seed
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-muted-foreground">Preview</span>
          <div className="rounded-lg border bg-muted/30 p-3">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Generated pfp preview"
                className="size-40 rounded-md object-cover [image-rendering:pixelated]"
              />
            ) : (
              <div className="flex size-40 items-center justify-center text-xs text-muted-foreground">
                No preview
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span>POST <code className="font-mono">{directPreviewUrl}</code></span>
          <span>Set <code className="font-mono">PEXELS_API_KEY</code> on the daemon for real flower photos.</span>
          <span>Without a key, a procedural flower is used.</span>
        </div>
      </div>

      {source ? (
        <div className="flex flex-col gap-1 border-t pt-4 text-xs">
          <span className="text-muted-foreground">
            Source: <code className="font-mono">{source}</code>
            {photographer ? ` · ${photographer}` : null}
          </span>
          {source === 'pexels' ? (
            <div className="flex flex-wrap gap-3">
              {imageUrl ? (
                <a href={imageUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  Original image ↗
                </a>
              ) : null}
              {sourceUrl ? (
                <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  Pexels page ↗
                </a>
              ) : null}
            </div>
          ) : (
            <span className="text-muted-foreground">
              No Pexels key set — showing procedural fallback. Add <code className="font-mono">PEXELS_API_KEY</code> to <code className="font-mono">.env</code> and restart the daemon.
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
