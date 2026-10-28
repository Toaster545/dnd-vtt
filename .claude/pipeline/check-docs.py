#!/usr/bin/env python3
"""Orchestrator-side checks for docs runs. Usage: check-docs.py <base_sha>
Fails (exit 1) on: broken relative links in docs/, missing 'Last updated:' line, secret-looking
values, or changes outside docs/ and .ai-plans/ since <base_sha> (committed or not)."""
import glob, os, re, subprocess, sys

base = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
problems = []

for f in glob.glob("docs/**/*.md", recursive=True):
    text = open(f, encoding="utf-8").read()
    if not re.search(r"^Last updated:", text, re.M):
        problems.append(f"{f}: no 'Last updated:' line")
    for m in re.finditer(r"\]\(([^)#\s]+)(#[^)]*)?\)", text):
        link = m.group(1)
        if re.match(r"[a-z]+:", link):
            continue
        if not os.path.exists(os.path.normpath(os.path.join(os.path.dirname(f), link))):
            problems.append(f"{f}: broken link {link}")
    for m in re.finditer(r"(?i)(secret|password|api[_-]?key|token)[a-z_]*\s*[=:]\s*['\"`]?[A-Za-z0-9+/_-]{16,}|eyJ[A-Za-z0-9_-]{10,}", text):
        problems.append(f"{f}: secret-looking text near '{m.group(0)[:40]}'")

def git(*a):
    return subprocess.run(["git", *a], capture_output=True, text=True).stdout.split("\n")

changed = set(git("diff", "--name-only", base)) | set(git("ls-files", "--others", "--exclude-standard"))
for path in sorted(c for c in changed if c):
    if not (path.startswith("docs/") or path.startswith(".ai-plans/")):
        problems.append(f"changed outside docs/: {path}")

print("\n".join(problems) if problems else "docs checks: OK")
sys.exit(1 if problems else 0)
