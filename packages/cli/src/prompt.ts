import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export async function ask(question: string, defaultValue?: string): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error(`${question} (required in non-interactive mode)`);
  }

  const rl = createInterface({ input, output });
  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || defaultValue || '';
  } finally {
    rl.close();
  }
}

export function parseFlag(argv: string[], name: string): string | undefined {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const index = argv.indexOf(name);
  if (index >= 0 && argv[index + 1]) {
    return argv[index + 1];
  }
  return undefined;
}

export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}
