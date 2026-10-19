# Test rapide des deux formats depuis PowerShell : .\examples\test.ps1
$key = (Get-Content "$PSScriptRoot\..\.env" | Where-Object { $_ -match '^LLM_API_KEY=' }) -replace '^LLM_API_KEY=', ''
$base = "http://localhost:4000"

Write-Host "--- Format OpenAI ---"
$body = @{ model = "local"; messages = @(@{ role = "user"; content = "Dis bonjour en une phrase." }) } | ConvertTo-Json -Depth 5
$r = Invoke-RestMethod "$base/v1/chat/completions" -Method Post -Headers @{ Authorization = "Bearer $key" } -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
$r.choices[0].message.content

Write-Host "--- Format Claude ---"
$body = @{ model = "local"; max_tokens = 200; messages = @(@{ role = "user"; content = "Dis bonjour en une phrase." }) } | ConvertTo-Json -Depth 5
$r = Invoke-RestMethod "$base/v1/messages" -Method Post -Headers @{ "x-api-key" = $key; "anthropic-version" = "2023-06-01" } -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($body))
$r.content[0].text
