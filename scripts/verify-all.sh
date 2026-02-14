#!/usr/bin/env bash
set -euo pipefail

echo "== Backend tests/build =="
cd backend
npm test
npm run build

echo "== Frontend tests/build =="
cd ../frontend
npm test
npm run build

if npm run | grep -q "test:e2e"; then
  echo "== Frontend E2E tests =="
  npm run test:e2e
fi
