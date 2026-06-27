import { describe, expect, it } from 'vitest';
import {
  extractVaultAnnotations,
  formatVaultListLine,
  parseVaultListLine,
  reapplyVaultAnnotations,
  updateVaultFileItemMeta
} from './vault-item-meta';

describe('vault item meta parsing', () => {
  it('reads tagged list lines', () => {
    const parsed = parseVaultListLine('- [tb color=#ef4444 assign=flynn-o-brien] Ship pagination first');
    expect(parsed).toEqual({
      meta: { color: '#ef4444', assign: 'flynn-o-brien' },
      text: 'Ship pagination first'
    });
  });

  it('writes and updates markdown list lines', () => {
    const content = '# Observations\n- Users spend 70% of session time on the funnel widget.\n';
    const next = updateVaultFileItemMeta(
      content,
      'Users spend 70% of session time on the funnel widget.',
      { color: '#22c55e', assign: 'marcus-webb' }
    );
    expect(next).toContain('- [tb color=#22c55e assign=marcus-webb] Users spend 70%');
    expect(formatVaultListLine('Plain item', {})).toBe('- Plain item');
  });

  it('reapplies saved annotations after rebuild', () => {
    const saved = extractVaultAnnotations('- [tb color=#3b82f6 assign=dev-khanna] Keep the cache warm\n');
    const rebuilt = reapplyVaultAnnotations('- Keep the cache warm\n', saved);
    expect(rebuilt.trim()).toBe('- [tb color=#3b82f6 assign=dev-khanna] Keep the cache warm');
  });
});
