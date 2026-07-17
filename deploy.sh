#!/bin/bash
cd ~/Downloads/voyage-journal || { echo "ERROR: project folder not found — stopping, nothing was touched."; exit 1; }
TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
if [ "$TOPLEVEL" != "$HOME/Downloads/voyage-journal" ]; then
  echo "ERROR: this folder isn't its own git repository (found: ${TOPLEVEL:-none})."
  echo "Fix with: git init && git remote add origin https://github.com/kapileswarsingh92/the-voyage-journal.git"
  exit 1
fi
echo "Working in: $(pwd)"
git add -A
git commit -m "${1:-Update site}"
git branch -M main
git push -u origin main --force
