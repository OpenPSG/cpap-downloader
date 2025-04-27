import { readFile } from "fs/promises";
import path from "path";
import fs from "fs";

export async function loadDirectoryFromFolder(
  folderPath: string,
): Promise<Map<string, File>> {
  const directory = new Map<string, File>();

  // Read directory contents recursively
  const files = await getAllFiles(folderPath);

  for (const filePath of files) {
    const buffer = await readFile(filePath);
    const relativePath = path
      .relative(folderPath, filePath)
      .replace(/\\/g, "/"); // Normalize to unix slashes
    directory.set(relativePath, new File([buffer], path.basename(filePath)));
  }

  return directory;
}

async function getAllFiles(dir: string): Promise<string[]> {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = path.resolve(dir, dirent.name);
      return dirent.isDirectory() ? getAllFiles(res) : res;
    }),
  );
  return Array.prototype.concat(...files);
}
