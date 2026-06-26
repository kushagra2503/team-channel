import { useMemo } from 'react';
import type { VaultContext } from '@teambridge/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type VaultHighlightsProps = {
  context?: VaultContext;
  loading?: boolean;
  error?: string;
};

type VaultSection = {
  path: string;
  title: string;
  items: string[];
};

function parseVaultSections(content: string): VaultSection[] {
  const sections: VaultSection[] = [];
  const pattern = /--- ([^-]+) ---\n([\s\S]*?)(?=\n--- |$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const path = match[1].trim();
    const bodyLines = match[2]
      .trim()
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#'));
    const usefulLines = bodyLines.filter((line) => line.trim().startsWith('-'));

    if (usefulLines.length > 0) {
      sections.push({
        path,
        title: path.replace(/\.md$/, '').replace(/-/g, ' '),
        items: usefulLines.map((line) => line.replace(/^-\s*/, ''))
      });
    }
  }

  return sections;
}

export function VaultHighlights({ context, loading = false, error }: VaultHighlightsProps) {
  const sections = useMemo(() => (context ? parseVaultSections(context.content) : []), [context?.content]);

  if (loading) {
    return (
      <Card>
        <section aria-label="Vault highlights">
          <CardContent className="text-muted-foreground">Loading vault highlights...</CardContent>
        </section>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <section aria-label="Vault highlights">
          <CardContent>
            <p role="alert" className="text-destructive">{error}</p>
          </CardContent>
        </section>
      </Card>
    );
  }

  if (!context) {
    return (
      <Card>
        <section aria-label="Vault highlights">
          <CardContent className="text-muted-foreground">Select a workspace to inspect vault highlights.</CardContent>
        </section>
      </Card>
    );
  }

  return (
    <Card>
      <section aria-labelledby="vault-highlights-title">
        <CardHeader>
          <CardTitle id="vault-highlights-title">Context</CardTitle>
          <CardDescription>Latest note #{context.lastSeq ?? 0}{context.truncated ? ' · preview truncated' : ''}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {sections.length === 0 ? (
            <p className="text-muted-foreground">No published notes yet.</p>
          ) : (
            <div className="grid gap-3">
              {sections.map((section) => (
                <article key={section.path} className="rounded-2xl border border-border bg-muted/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium capitalize">{section.title}</h3>
                    <Badge variant="outline">{section.path}</Badge>
                  </div>
                  <ul className="space-y-2 text-sm leading-relaxed text-foreground">
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer text-foreground">Sources</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {context.includedPaths.map((path) => (
                <Badge key={path} variant="outline">{path}</Badge>
              ))}
            </div>
          </details>
        </CardContent>
      </section>
    </Card>
  );
}
