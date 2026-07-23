const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SCAN_EXTENSIONS = new Set([".ts", ".js", ".html"]);
const IGNORED_PATHS = [/^scripts\/audit-/, /^scripts\/seed-/];

const PATTERNS = [
  {
    name: "Google ID token log",
    regex: /console\.(log|debug|warn|error)\([^)]*ID Token[^)]*\)/gi,
  },
  {
    name: "Sensitive token log",
    regex:
      /(console\.(log|debug|warn|error)|logger\.(verbose|debug|log|warn|error))\([^)]*(accessToken|refreshToken|refresh_token|credential|password|secret)[^)]*\)/gi,
  },
  {
    name: "Raw access token interpolation",
    regex: /Token\s+\$\{token\.accessToken\}/g,
  },
  {
    name: "Raw refresh token interpolation",
    regex: /refreshToken:\s*\$\{/g,
  },
  {
    name: "Raw error console log",
    regex: /console\.log\(\s*error\s*\)/g,
  },
];

function sourceFiles() {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(
      (file) =>
        !IGNORED_PATHS.some((pattern) =>
          pattern.test(file.replace(/\\/g, "/")),
        ),
    )
    .filter((file) => SCAN_EXTENSIONS.has(path.extname(file)));
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const findings = [];

for (const relativeFile of sourceFiles()) {
  const absoluteFile = path.join(ROOT, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    continue;
  }
  const text = fs.readFileSync(absoluteFile, "utf8");

  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      findings.push({
        file: relativeFile,
        line: lineNumber(text, match.index || 0),
        type: pattern.name,
      });
    }
  }
}

if (findings.length) {
  console.error("Potential sensitive logs found:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.type}`);
  }
  process.exit(1);
}

console.log("No obvious sensitive logs found in source tree scan.");
