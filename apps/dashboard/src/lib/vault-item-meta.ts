/** Mirror of @coord/core/vault-annotations for Vite ESM. */

export type VaultItemMeta = {
  color?: string;
  assign?: string;
};

const TAGGED_LINE_RE = /^- \[tb ([^\]]*)\] (.+)$/;
const PLAIN_LINE_RE = /^- (.+)$/;

export function parseVaultItemMeta(raw: string): VaultItemMeta {
  const meta: VaultItemMeta = {};
  for (const part of raw.trim().split(/\s+/).filter(Boolean)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (key === 'color' && /^#[0-9a-fA-F]{6}$/.test(value)) meta.color = value.toLowerCase();
    if (key === 'assign' && /^[\w-]+$/.test(value)) meta.assign = value;
  }
  return meta;
}

export function parseVaultListLine(line: string): { text: string; meta: VaultItemMeta } | null {
  const trimmed = line.trim();
  const tagged = trimmed.match(TAGGED_LINE_RE);
  if (tagged) {
    return { meta: parseVaultItemMeta(tagged[1]), text: tagged[2] };
  }
  const plain = trimmed.match(PLAIN_LINE_RE);
  if (plain) return { meta: {}, text: plain[1] };
  return null;
}

export function formatVaultListLine(text: string, meta: VaultItemMeta = {}): string {
  const tags: string[] = [];
  if (meta.color) tags.push(`color=${meta.color}`);
  if (meta.assign) tags.push(`assign=${meta.assign}`);
  if (tags.length === 0) return `- ${text}`;
  return `- [tb ${tags.join(' ')}] ${text}`;
}

export function updateVaultFileItemMeta(content: string, itemText: string, meta: VaultItemMeta): string {
  let updated = false;
  const lines = content.split('\n').map((line) => {
    const parsed = parseVaultListLine(line);
    if (!parsed || parsed.text !== itemText) return line;
    updated = true;
    return formatVaultListLine(parsed.text, meta);
  });
  if (!updated) {
    throw new Error(`Vault item not found: ${itemText}`);
  }
  return lines.join('\n');
}

export function extractVaultAnnotations(content: string): Map<string, VaultItemMeta> {
  const annotations = new Map<string, VaultItemMeta>();
  for (const line of content.split('\n')) {
    const parsed = parseVaultListLine(line);
    if (!parsed) continue;
    if (parsed.meta.color || parsed.meta.assign) {
      annotations.set(parsed.text, parsed.meta);
    }
  }
  return annotations;
}

export function reapplyVaultAnnotations(content: string, annotations: Map<string, VaultItemMeta>): string {
  if (annotations.size === 0) return content;
  return content
    .split('\n')
    .map((line) => {
      const parsed = parseVaultListLine(line);
      if (!parsed) return line;
      const saved = annotations.get(parsed.text);
      if (!saved) return line;
      return formatVaultListLine(parsed.text, { ...saved, ...parsed.meta });
    })
    .join('\n');
}
