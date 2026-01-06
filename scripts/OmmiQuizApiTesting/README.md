# NanoQuiz API Testing Module

Dieses PowerShell-Modul stellt Hilfsfunktionen bereit, um die Bereitstellung des NanoQuiz-Backends auf einfache Art zu testen. Die Functions nutzen standardmäßig die produktive Basis-URL `https://nanoquiz-backend-woe2w.ondigitalocean.app/api/`, lassen sich aber auf andere Umgebungen umkonfigurieren.

## Installation

```powershell
Import-Module "$PSScriptRoot/NanoQuizApiTesting.psm1"
```

Alternativ kann das Modul auch mit einem absoluten Pfad geladen werden:

```powershell
Import-Module /path/to/repo/scripts/NanoQuizApiTesting/NanoQuizApiTesting.psm1
```

## Wichtige Functions

| Function | Zweck |
| --- | --- |
| `Set-NanoQuizApiBaseUrl` | Überschreibt die Basis-URL, falls gegen Staging oder lokal getestet werden soll. |
| `Get-NanoQuizApiBaseUrl` | Gibt die aktuell konfigurierte Basis-URL zurück. |
| `Invoke-NanoQuizApiRequest` | Low-Level Wrapper für HTTP-Aufrufe. |
| `Test-NanoQuizHealthEndpoint` | Prüft das `/health`-Endpoint auf Erfolg. |
| `Get-NanoQuizFlashcardSets` | Ruft die Übersicht aller Flashcard-Sets ab. |
| `Get-NanoQuizFlashcardSet` | Ruft ein spezifisches Flashcard-Set ab. |
| `Test-NanoQuizFlashcardListing` | Stellt sicher, dass mindestens ein Flashcard-Set mit Metadaten vorhanden ist. |
| `Test-NanoQuizFlashcardDetail` | Validiert die Struktur eines konkreten Flashcard-Sets. |
| `Invoke-NanoQuizApiSmokeTests` | Führt alle Tests aus und liefert ein zusammengefasstes Ergebnis. |

## Beispiel

```powershell
# Modul einbinden
Import-Module ./scripts/NanoQuizApiTesting/NanoQuizApiTesting.psm1

# Gegen lokale Instanz testen
Set-NanoQuizApiBaseUrl -BaseUrl 'http://localhost:8000/api/'

# Smoke-Tests ausführen
$result = Invoke-NanoQuizApiSmokeTests
$result.Summary
$result.Results | Format-Table Test, Success, StatusCode, Message
```

## Hinweise

- Für die HTTP-Aufrufe wird `Invoke-WebRequest` verwendet, damit Statuscodes zuverlässig ausgelesen werden können.
- Alle Functions geben strukturierte Objekte zurück, die sich für Auswertungen, Logging oder CI/CD-Pipelines eignen.
- Fehlerhafte HTTP-Statuscodes führen zu aussagekräftigen Exceptions, was die Fehleranalyse vereinfacht.
