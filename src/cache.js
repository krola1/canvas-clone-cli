import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

const cachePath = () => join(configDir(), "cache.json");

function readAll() {
  const p = cachePath();
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

// Cachen er nøkkelsatt på canvasUrl, slik at flere Canvas-instanser ikke kan
// blande sammen gamle data hvis config noen gang peker et annet sted.
export function loadCourseCache(config) {
  return readAll()[config.canvasUrl] ?? null;
}

export function saveCourseCache(config, courses) {
  const all = readAll();
  all[config.canvasUrl] = { fetchedAt: Date.now(), courses };
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(cachePath(), JSON.stringify(all, null, 2) + "\n");
}

export function isFresh(entry, ttlMinutes) {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttlMinutes * 60 * 1000;
}

export function ageMinutes(entry) {
  return Math.round((Date.now() - entry.fetchedAt) / 60000);
}
