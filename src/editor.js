import { spawnSync } from "node:child_process";

// Bestemmer HVORDAN en mappe åpnes i editoren, uten å gjøre det:
// - win32: ingen prosess startes i det hele tatt (code.cmd o.l. kan ikke
//   startes uten shell, og shell: true er bevisst utelukket). I stedet
//   returneres kommandoen som skal skrives ut til brukeren.
// - POSIX: spawnSync(editor, [dest]) uten shell - editor kan være et
//   kommandonavn eller en full sti, og argumentet tolkes aldri av et shell.
export function planOpen(editor, dest, platform = process.platform) {
  if (platform === "win32") return { print: `${editor} "${dest}"` };
  return { spawn: [editor, [dest]] };
}

// Returnerer {ok:true} | {ok:false} | {print: "<kommando>"}.
export function openInEditor(editor, dest, platform = process.platform) {
  const plan = planOpen(editor, dest, platform);
  if (plan.print) return { print: plan.print };
  const [cmd, args] = plan.spawn;
  const res = spawnSync(cmd, args, { stdio: "ignore" });
  return { ok: res.status === 0 };
}
