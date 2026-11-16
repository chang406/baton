// 비밀값 패턴 (scan-secrets.mjs와 rescue.mjs가 같이 쓴다). 읽기 전용.
// 내용 패턴 (이름, 정규식)
export const patterns = [
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
export const mask = (s) => `${s.slice(0, Math.min(4, Math.floor(s.length / 3)))}****(${s.length}자)`;
// 글 속 비밀값처럼 보이는 부분을 가린다 (세션 기록을 보여줄 때)
export function redact(text) {
  let t = String(text || "");
  for (const [, re] of patterns) t = t.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"), (m) => mask(m));
  return t;
}
