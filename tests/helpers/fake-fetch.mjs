// Lastes med `node --import` i e2e-testene (tests/e2e.test.js). Erstatter
// globalThis.fetch med en falsk Canvas-server som leser et scenario fra
// FAKE_CANVAS (JSON-fil) og logger hvert kall (metode, URL, form-body) som
// JSON-linjer til FAKE_FETCH_LOG. Gjør aldri ekte nettverkskall.
import { readFileSync, appendFileSync } from "node:fs";

const scenario = JSON.parse(readFileSync(process.env.FAKE_CANVAS, "utf8"));
const logPath = process.env.FAKE_FETCH_LOG;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = init.method ?? "GET";
  if (logPath) appendFileSync(logPath, JSON.stringify({ method, url: url.href, body: init.body ?? null }) + "\n");

  if (url.origin !== scenario.origin) throw new TypeError("fetch failed (fake: unknown host)");
  const p = url.pathname;
  let m;
  if (p === "/api/v1/users/self") return json({ id: 99, name: "Lærer" });
  if (p === "/api/v1/courses") return json(scenario.courses);
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments$/))) return json(scenario.assignments[m[1]] ?? []);
  if ((m = p.match(/^\/api\/v1\/courses\/(\d+)\/assignments\/(\d+)\/submissions$/)))
    return json(scenario.submissions[`${m[1]}:${m[2]}`] ?? []);
  if (method === "PUT" && (m = p.match(/^\/api\/v1\/courses\/\d+\/assignments\/\d+\/submissions\/(\d+)$/)))
    return json({ id: Number(m[1]), grade: new URLSearchParams(init.body).get("submission[posted_grade]") });
  return json({ errors: [{ message: "not found" }] }, 404);
};
