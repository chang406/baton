// 사용자 줄 판정(known.mjs)이 Git 이력 없이도 옛 버전을 알아보는지
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HARNESS, LEGACY_KIT, tmp, write } from "./helpers.mjs";

test("이력 없는 사본: 스냅숏(known-history.json)만으로 옛 키트와 옛 deep-audit 줄을 원본 줄로 판정", async () => {
  const base = tmp("nohist"); // Git 저장소가 아닌 임시 폴더
  for (const p of ["baton/known.mjs", "baton/known-history.json", "baton/files", "audit/agents", "audit/commands"]) {
    cpSync(join(HARNESS, p), join(base, p), { recursive: true });
  }
  const k = await import(pathToFileURL(join(base, "baton", "known.mjs")).href);
  assert.equal(k.HARNESS, base);

  const legacy = readFileSync(join(LEGACY_KIT, "AGENTS.md"), "utf8");
  assert.deepEqual(k.userLines("AGENTS.md", legacy), [], "옛 AGENTS.md는 전부 baton 줄");
  assert.ok(k.isKitFile("STATUS.md"), "지금은 없는 옛 키트 파일도 키트 파일로 앎");
  assert.deepEqual(k.userLines("AGENTS.md", legacy + "- 유니티 빌드는 금요일 금지\n"), ["- 유니티 빌드는 금요일 금지"], "사용자 줄은 그대로 잡음");

  const oldAudit = readFileSync(join(HARNESS, "tests/fixtures/old-deep-audit.md"), "utf8").replace(/\r\n/g, "\n");
  const known = k.knownLinesAt("audit/agents/deep-audit.md");
  assert.deepEqual(oldAudit.split("\n").map(k.norm).filter((l) => l.trim() && !known.has(l)), [], "옛 deep-audit도 전부 원본 줄");

  write(base, "baton/known-history.json", "{ 깨진 파일");
  const again = await import(pathToFileURL(join(base, "baton", "known.mjs")).href + "?broken");
  assert.ok(again.userLines("AGENTS.md", legacy).length > 0, "스냅숏이 깨지면 더 조심하는 쪽(사용자 줄로 봄)");
});
