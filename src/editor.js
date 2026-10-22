import { spawnSync } from "node:child_process";

export function openInEditor(editorCmd, dest) {
  const res = spawnSync(editorCmd, [dest], { stdio: "ignore" });
  return res.status === 0;
}
