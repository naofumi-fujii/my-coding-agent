import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';

export const readFileSchema = z.object({
  path: z.string().describe('File path to read'),
});

export async function readFile(args: z.infer<typeof readFileSchema>) {
  try {
    const filePath = path.resolve(args.path);
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  } catch (error) {
    return { error: `Failed to read file: ${(error as Error).message}` };
  }
}

export const writeFileSchema = z.object({
  path: z.string().describe('File path to write'),
  content: z.string().describe('Content to write to the file'),
});

export async function writeFile(args: z.infer<typeof writeFileSchema>) {
  try {
    const filePath = path.resolve(args.path);
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, args.content);
    return { success: true, message: `Successfully wrote to ${args.path}` };
  } catch (error) {
    return { error: `Failed to write file: ${(error as Error).message}` };
  }
}

export const listFilesSchema = z.object({
  directory: z.string().describe('Directory path to list files from'),
});

export async function listFiles(args: z.infer<typeof listFilesSchema>) {
  try {
    const dirPath = path.resolve(args.directory);
    const files = await fs.readdir(dirPath);
    return { files };
  } catch (error) {
    return { error: `Failed to list files: ${(error as Error).message}` };
  }
}