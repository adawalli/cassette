import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";

// Check the actual installer guard at both sides of the supported Bun floor.
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const guard = manifest.private
  ? manifest.scripts.preinstall.match(/^bun -e '(.*)'$/)[1]
  : (await readFile("scripts/install.mjs", "utf8")).replace(/^import .*;\n/gm, "");
for (const version of ["1.2.14", "1.3.0"]) {
  const check = () =>
    runInNewContext(guard, {
      Bun: { version, semver: globalThis.Bun.semver },
      spawnSync: () => ({ status: 0 }),
      process: { execPath: "bun", argv: ["bun", "install.mjs"], exit() {} },
    });
  if (version === "1.2.14") assert.throws(check, /Use Bun >=1.3.0/);
  else assert.doesNotThrow(check);
}

// Test real Bun resolution without public registry access or package downloads.
const directory = await mkdtemp(join(tmpdir(), "dependency-age-"));
const names = ["age-check-direct", "age-check-transitive"];
const old = new Date(Date.now() - 4 * 86400_000).toISOString();
const fresh = new Date(Date.now() - 2 * 86400_000).toISOString();
let registry;
const server = createServer((request, response) => {
  const name = request.url.slice(1);
  if (!names.includes(name)) return void response.writeHead(404).end();
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({
      name,
      "dist-tags": { latest: "1.0.1" },
      time: { "1.0.0": old, "1.0.1": fresh },
      versions: Object.fromEntries(
        ["1.0.0", "1.0.1"].map((version) => [
          version,
          {
            name,
            version,
            dependencies: name === names[0] ? { [names[1]]: "^1.0.0" } : {},
            dist: { tarball: `${registry}/${name}-${version}.tgz`, shasum: "a".repeat(40) },
          },
        ]),
      ),
    }),
  );
});
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  registry = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ dependencies: { [names[0]]: "^1.0.0" } }),
  );
  await copyFile("bunfig.toml", join(directory, "bunfig.toml"));
  await promisify(execFile)(
    process.execPath,
    [
      "install",
      "--lockfile-only",
      "--ignore-scripts",
      "--registry",
      registry,
      "--cache-dir",
      join(directory, "cache"),
    ],
    { cwd: directory, timeout: 20_000 },
  );
  const lockfile = await readFile(join(directory, "bun.lock"), "utf8");
  for (const name of names) {
    assert.ok(lockfile.includes(`${name}@1.0.0`), `${name}: old release selected`);
    assert.ok(!lockfile.includes(`${name}@1.0.1`), `${name}: fresh release excluded`);
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
