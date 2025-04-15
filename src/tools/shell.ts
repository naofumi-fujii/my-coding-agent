import { execSync } from 'child_process';
import { z } from 'zod';

export const executeCommandSchema = z.object({
  command: z.string().describe('Shell command to execute'),
});

export async function executeCommand(args: z.infer<typeof executeCommandSchema>) {
  try {
    const output = execSync(args.command, { encoding: 'utf-8' });
    return { output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { error: `Command execution failed: ${errorMessage}` };
  }
}