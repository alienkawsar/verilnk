$ErrorActionPreference = "Stop"

Write-Host "== Backend tests/build =="
Push-Location backend
npm test
npm run build
Pop-Location

Write-Host "== Frontend tests/build =="
Push-Location frontend
npm test
npm run build
if ((npm run) -match "test:e2e") {
    Write-Host "== Frontend E2E tests =="
    npm run test:e2e
}
Pop-Location
