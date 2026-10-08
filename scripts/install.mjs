import { spawnSync } from "node:child_process";

if (!Bun.semver.satisfies(Bun.version, ">=1.3.0")) {
  throw new Error("Use Bun >=1.3.0; older versions ignore minimumReleaseAge");
}
const result = spawnSync(process.execPath, ["install", ...process.argv.slice(2)], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
