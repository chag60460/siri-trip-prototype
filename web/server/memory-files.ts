import { Volume, createFsFromVolume } from 'memfs';
import { posix } from 'node:path';
import type { SessionFsProvider } from '@github/copilot-sdk';

export function createMemoryFiles(workingDirectory: string): SessionFsProvider {
  const volume = new Volume();
  const fs = createFsFromVolume(volume).promises;
  volume.mkdirSync(workingDirectory, { recursive: true });
  volume.mkdirSync('/state', { recursive: true });
  return {
    async readFile(path) {
      return String(await fs.readFile(path, 'utf8'));
    },
    async writeFile(path, content, mode = 0o600) {
      await fs.mkdir(posix.dirname(path), { recursive: true });
      await fs.writeFile(path, content, { mode });
    },
    async appendFile(path, content, mode = 0o600) {
      await fs.mkdir(posix.dirname(path), { recursive: true });
      await fs.appendFile(path, content, { mode });
    },
    async exists(path) {
      return volume.existsSync(path);
    },
    async stat(path) {
      const stat = await fs.stat(path);
      return {
        isFile: stat.isFile(), isDirectory: stat.isDirectory(), size: Number(stat.size),
        mtime: stat.mtime.toISOString(), birthtime: stat.birthtime.toISOString(),
      };
    },
    async mkdir(path, recursive, mode = 0o700) {
      await fs.mkdir(path, { recursive, mode });
    },
    async readdir(path) {
      const entries = await fs.readdir(path);
      return entries.map(String);
    },
    async readdirWithTypes(path) {
      const entries = await fs.readdir(path, { withFileTypes: true });
      return entries.map(entry => {
        if (typeof entry === 'string' || !('isDirectory' in entry)) throw new TypeError('Expected a directory entry with type information.');
        return { name: String(entry.name), type: entry.isDirectory() ? 'directory' : 'file' };
      });
    },
    async rm(path, recursive, force) {
      await fs.rm(path, { recursive, force });
    },
    async rename(from, to) {
      await fs.rename(from, to);
    },
  };
}
