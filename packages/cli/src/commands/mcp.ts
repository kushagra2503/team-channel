import { startServer } from '@teambridge/mcp';

export async function runMcp(): Promise<void> {
  await startServer();
}
