import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

const MANUAL_MAP = {
  "src/index.ts": "test/cli.test.ts",
};

function srcToTest(file) {
  const rel = path.relative(root, file);
  if (MANUAL_MAP[rel]) return path.join(root, MANUAL_MAP[rel]);
  const match = rel.match(/^src\/(.+)\.ts$/);
  if (!match) return null;
  const candidate = path.join(root, "test", `${match[1]}.test.ts`);
  return existsSync(candidate) ? candidate : null;
}

export default {
  "*.ts": (files) => {
    const testFiles = new Set();
    for (const file of files) {
      if (file.includes("/test/") && file.endsWith(".test.ts")) {
        testFiles.add(file);
        continue;
      }
      const test = srcToTest(file);
      if (test) testFiles.add(test);
    }
    const cmds = [`prettier --write ${files.join(" ")}`];
    // Run each test file separately to avoid mock.module contamination between files
    for (const tf of testFiles) {
      cmds.push(`bun test ${tf}`);
    }
    return cmds;
  },
};
