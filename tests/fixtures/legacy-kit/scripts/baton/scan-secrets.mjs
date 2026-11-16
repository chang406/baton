#!/usr/bin/env node
// 비밀값 검사. 커밋 대상이 될 수 있는 파일(추적 중 + .gitignore에 안 걸린 새 파일)에서
// API 키, 비밀번호, 개인 키 같은 것이 보이는지 찾는다.
// - 찾은 값은 화면에 **가려서** 보여준다 (비밀값이 대화 기록에 남지 않게).
// - 기본은 경고만 하고 성공(exit 0). --strict 를 붙이면 발견 시 실패(exit 1).
// - 읽기 전용. 네트워크를 쓰지 않는다.
import { readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { git, findBatonRoot } from "./lib.mjs";

const strict = process.argv.includes("--strict");
const root = git("rev-parse", "--show-toplevel") || findBatonRoot();
const files = git("ls-files", "-co", "--exclude-standard").split("\n").filter(Boolean);

// 파일 이름만으로 위험한 것
const riskyNames = [
  /(^|\/)\.env(\.[^/]*)?$/i,            // .env, .env.local ...
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)id_(rsa|ed25519|ecdsa)$/,
  /(^|\/)(credentials|service[-_]?account[^/]*)\.json$/i,
];
const allowNames = [/\.env\.(example|sample|template)$/i];

// 내용 패턴 (이름, 정규식)
const patterns = [
  ["개인 키", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS 액세스 키", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub 토큰", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/],
  ["Anthropic 키", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI 키", /\bsk-(proj-)?[A-Za-z0-9_-]{32,}/],
  ["Slack 토큰", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["Google API 키", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Stripe 비밀 키", /\b(sk|rk)_live_[0-9A-Za-z]{20,}/],
  ["JWT 토큰 (Supabase 키 등)", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["DB 접속 주소(비밀번호 포함)", /\b(postgres(ql)?|mysql|mongodb(\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/i],
  ["비밀번호·토큰 직접 입력", /\b(password|passwd|secret|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*["'][^"'\s]{8,}["']/i],
];

// 앞 4글자와 길이만 보여준다. 끝부분은 절대 보여주지 않는다.
const mask = (s) => `${s.slice(0, Math.min(4, Math.floor(s.length / 3)))}****(${s.length}자)`;
const findings = [];

for (const rel of files) {
  if (allowNames.some((r) => r.test(rel))) continue;
  if (riskyNames.some((r) => r.test(rel))) {
    findings.push(`${rel} — 비밀값이 들어 있을 수 있는 파일 이름`);
    continue;
  }
  const full = join(root, rel);
  let st;
  try { st = statSync(full); } catch { continue; }
  if (!st.isFile() || st.size > 1024 * 1024) continue;   // 1MB 넘는 파일은 건너뜀
  let text;
  try { text = readFileSync(full, "utf8"); } catch { continue; }
  if (text.includes("\u0000")) continue;                  // 바이너리
  if (/scan-secrets\.mjs$/.test(rel)) continue;           // 이 파일 자신
  if (/^(AGENTS|CLAUDE)\.md$|(^|\/)docs\/baton\/|(^|\/)\.claude\/(agents|commands)\//.test(rel)) continue; // baton 규칙 문서 (예시 이름만 있음)
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [name, re] of patterns) {
      const m = line.match(re);
      if (m) {
        findings.push(`${rel}:${i + 1} — ${name} (${mask(m[0])})`);
        break;
      }
    }
  });
}

if (!findings.length) {
  console.log("[scan-secrets] OK — 비밀값으로 보이는 것을 찾지 못했습니다.");
  process.exit(0);
}
console.log(`[scan-secrets] 확인 필요 ${findings.length}건 (값은 가려서 표시):`);
for (const f of findings.slice(0, 50)) console.log(`  - ${f}`);
if (findings.length > 50) console.log(`  ... 외 ${findings.length - 50}건`);
console.log("  → 진짜 비밀값이면 커밋하지 말고 .gitignore나 환경변수로 옮기세요. 예시·가짜 값이면 무시해도 됩니다.");
process.exit(strict ? 1 : 0);
