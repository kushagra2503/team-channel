import { startServer } from '@coord/mcp';

export async function runMcp(): Promise<void> {
  await startServer();
}
