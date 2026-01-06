# OmmiQuiz API Testing Module

Dieses PowerShell-Modul stellt Hilfsfunktionen bereit, um die Bereitstellung des OmmiQuiz-Backends auf einfache Art zu testen. Die Functions nutzen standardmäßig die produktive Basis-URL `https://nanoquiz-backend-ypez6.ondigitalocean.app/api/`, lassen sich aber auf andere Umgebungen umkonfigurieren.

## Installation

```powershell
Import-Module "$PSScriptRoot/OmmiQuizApiTesting.psm1"
```

Alternativ kann das Modul auch mit einem absoluten Pfad geladen werden:

```powershell
Import-Module /path/to/repo/scripts/OmmiQuizApiTesting/OmmiQuizApiTesting.psm1
```

## Wichtige Functions

### Konfiguration
| Function | Zweck |
| --- | --- |
| `Set-OmmiQuizApiBaseUrl` | Überschreibt die Basis-URL, falls gegen Staging oder lokal getestet werden soll. |
| `Get-OmmiQuizApiBaseUrl` | Gibt die aktuell konfigurierte Basis-URL zurück. |

### Flashcard Management
| Function | Zweck |
| --- | --- |
| `Get-OmmiQuizFlashcardSet -FlashcardId <id>` | Ruft ein spezifisches Flashcard-Set ab. |
| `Get-OmmiQuizFlashcardSet -All` | Ruft die Übersicht aller Flashcard-Sets ab. |
| `Get-OmmiQuizSpeedQuizPdf -FlashcardId <id>` | Lädt ein Speed-Quiz PDF mit 12 zufälligen Karten herunter. |

### Logging
| Function | Zweck |
| --- | --- |
| `Get-OmmiQuizLog` | Queries application logs mit Filter-Optionen (Level, Zeit, Inhalt). |
| `Get-OmmiQuizLogFile -Filename <name>` | Lädt eine spezifische Log-Datei herunter. |
| `Get-OmmiQuizLogFile -All` | Ruft Metadaten aller verfügbaren Log-Dateien ab. |

### Testing
| Function | Zweck |
| --- | --- |
| `Test-OmmiQuizHealthEndpoint` | Prüft das `/health`-Endpoint auf Erfolg. |
| `Test-OmmiQuizFlashcardListing` | Stellt sicher, dass mindestens ein Flashcard-Set mit Metadaten vorhanden ist. |
| `Test-OmmiQuizFlashcardDetail` | Validiert die Struktur eines konkreten Flashcard-Sets. |
| `Test-OmmiQuizSpeedQuizPdfEndpoint` | Testet PDF-Generierung für Speed-Quiz. |
| `Test-OmmiQuizLogsEndpoint` | Validiert den Logs-Endpoint. |
| `Test-OmmiQuizLogFilesEndpoint` | Validiert den Log-Files-Endpoint. |
| `Invoke-OmmiQuizApiSmokeTests` | Führt alle Tests aus und liefert ein zusammengefasstes Ergebnis. |

### Low-Level Functions
| Function | Zweck |
| --- | --- |
| `Invoke-OmmiQuizApiRequest` | Low-Level Wrapper für HTTP-Aufrufe. |

## Beispiele

### Gegen lokale Instanz testen
```powershell
# Modul einbinden
Import-Module ./scripts/OmmiQuizApiTesting/OmmiQuizApiTesting.psm1

# Gegen lokale Instanz testen
Set-OmmiQuizApiBaseUrl -BaseUrl 'http://localhost:8080/api/'

# Smoke-Tests ausführen
$result = Invoke-OmmiQuizApiSmokeTests
$result.Summary
$result.Results | Format-Table Test, Success, StatusCode, Message
```

### Flashcard-Sets abrufen
```powershell
# Alle Flashcard-Sets abrufen
Get-OmmiQuizFlashcardSet -All

# Einzelnes Flashcard-Set abrufen
Get-OmmiQuizFlashcardSet -FlashcardId "my-flashcard-set"
```

### Speed-Quiz PDF generieren
```powershell
# PDF mit 12 zufälligen Karten herunterladen
Get-OmmiQuizSpeedQuizPdf -FlashcardId "my-flashcard-set"

# PDF mit benutzerdefiniertem Pfad speichern
Get-OmmiQuizSpeedQuizPdf -FlashcardId "my-flashcard-set" -OutputPath "C:\Temp\quiz.pdf"

# PDF-Endpoint testen
Test-OmmiQuizSpeedQuizPdfEndpoint -FlashcardId "my-flashcard-set" -KeepFile
```

### Logs abfragen
```powershell
# Alle ERROR-Logs der letzten Stunde
Get-OmmiQuizLog -Level ERROR -StartTime (Get-Date).AddHours(-1) -Limit 50

# Logs mit bestimmtem Inhalt suchen
Get-OmmiQuizLog -MessageContains "flashcard" -Limit 100

# Verfügbare Log-Dateien auflisten
Get-OmmiQuizLogFile -All

# Spezifische Log-Datei herunterladen
Get-OmmiQuizLogFile -Filename "app-2025-12-16.log"
```

## PowerShell Naming Conventions

Alle Funktionen folgen den PowerShell Best Practices:
- **Singular Nouns**: Funktionen verwenden immer Singular (z.B. `Get-OmmiQuizFlashcardSet`, nicht `Get-OmmiQuizFlashcardSets`)
- **Parameter Sets**: Verwendung von `-All` Parameter für das Abrufen mehrerer Items
- **Konsistente Verben**: Standard PowerShell Verben (Get, Set, Test, Invoke)

## Hinweise

- Für die HTTP-Aufrufe wird `Invoke-WebRequest` verwendet, damit Statuscodes zuverlässig ausgelesen werden können.
- Alle Functions geben strukturierte Objekte zurück, die sich für Auswertungen, Logging oder CI/CD-Pipelines eignen.
- Fehlerhafte HTTP-Statuscodes führen zu aussagekräftigen Exceptions, was die Fehleranalyse vereinfacht.
- PDF-Downloads validieren automatisch den PDF-Header und die Dateigröße.
