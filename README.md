# SearchQuest – Lernkurs „Wie Suchmaschinen funktionieren“

Interaktiver, responsiver Lernkurs für eine 11. Klasse am beruflichen Gymnasium. Der rote Faden ist der Produktlaunch des fiktiven Onlineshops **UrbanStep** mit dem neuen Sneaker **RainStep One**.

## Inhalt

- Crawling und Googlebot
- Links und Sitemaps
- kurze Abgrenzung Web-Crawling ↔ Web-Scraping
- Indexierung und Suchmaschinenindex
- reale Produktseite als Analysebeispiel (IKEA KALLAX)
- Suchanfragen, Suchabsicht und Relevanz
- Ranking und Ranking-Signale
- SEO-Best-Practices
- strukturierte Produktdaten
- reale SEO-Fallstudien von Saramin, Monster India und Rakuten Recipe
- Abschlussmission: Search-Launch-Plan für UrbanStep

Der Kurs enthält **56 Pflichtaufgaben plus 7 Bonusaufgaben**. Pro Kapitel gibt es Aufgaben zum Wiedergeben, Anwenden und Beurteilen/Transfer. Diese Kategorien werden im Kurs selbst bewusst nicht als AFB ausgewiesen.

## Interaktivität

Enthalten sind u. a.:

- Single Choice
- Multiple Choice
- Richtig/Falsch
- Drag-and-Drop-Zuordnungen mit Touch-Alternative
- Reihenfolgen/Sortieraufgaben
- kurze Texteingaben
- längere Freitextaufgaben mit Selbstkontrolle
- Musterlösungen mit vorgeschalteter „Noch einmal versuchen?“-Abfrage

## Gamification

- XP für bearbeitete Aufgaben
- Levelsystem
- Konfetti und positive Rückmeldungen
- XP-Galerie mit freischaltbaren Hintergründen
- Avatare
- Begleiter/Haustiere
- Avatar und Begleiter dauerhaft im Kopfbereich sichtbar

## Gastmodus und Konten

Der Kurs funktioniert ohne Anmeldung. Im Gastmodus wird der Fortschritt lokal im Browser gespeichert.

Mit einem Schülerkonto wird der Fortschritt über **Netlify Functions + Netlify Blobs** serverseitig gespeichert und kann nach Anmeldung auf anderen Geräten fortgesetzt werden.

Bei Registrierung und Login werden immer benötigt:

- Klasse
- Nickname
- Passwort

Nicknames sind jeweils innerhalb einer Klasse eindeutig.

## Lehrerzugang

Lehrkräfte registrieren sich ebenfalls mit:

- Klasse
- Nickname
- Passwort
- Lehrercode

Der Lehrercode wird ausschließlich als Netlify-Umgebungsvariable gespeichert:

`TEACHER_CODE`

Es wird **keine allgemeine AUTH-Variable** benötigt.

Im Lehrerbereich kann die Lehrkraft für ihre eigene Klasse:

- den Lernfortschritt aller Schülerkonten sehen
- den Fortschritt einzelner Nutzer zurücksetzen
- den gesamten Klassenfortschritt zurücksetzen
- Schülerkonten löschen
- Schülerpasswörter neu setzen

Passwörter werden mit `scrypt` plus individuellem Salt gehasht gespeichert.

## Netlify-Blobs-Stores

Der Kurs verwendet drei site-gebundene Stores:

- `searchquest-users-v1`
- `searchquest-progress-v1`
- `searchquest-sessions-v1`

Die Daten bleiben serverseitig in Netlify Blobs und werden nicht über Supabase verwaltet.

## Deployment über GitHub + Netlify

1. ZIP entpacken.
2. **Den Inhalt des Ordners `searchmaschinen-lernkurs`** in ein neues GitHub-Repository hochladen.
3. In Netlify: **Add new site → Import an existing project → GitHub**.
4. Das Repository auswählen.
5. Build-Einstellungen können aus `netlify.toml` übernommen werden. Publish Directory ist `.` und Functions Directory `netlify/functions`.
6. In Netlify unter **Site configuration → Environment variables** eine Variable anlegen:

   `TEACHER_CODE = DEIN_GEHEIMER_LEHRERCODE`

7. Neu deployen.
8. Danach im Kurs ein Lehrerkonto mit exakt diesem Code registrieren.

## Technische Hinweise

- Netlify Functions: ESM (`.mjs`)
- Datenhaltung: `@netlify/blobs`
- keine externe Datenbank
- keine externen JS-Frameworks
- responsive HTML/CSS/JavaScript-App
- PWA-Manifest + Service Worker
- Windows, macOS, Android und iOS über moderne Browser nutzbar

## Quellen im Kurs

Fachliche Aussagen zu Google Search verlinken überwiegend auf **Google Search Central**. Reale SEO-Zahlen werden als konkrete Fallstudien mit Unternehmen und Zeitraum gekennzeichnet; sie werden nicht als allgemeine Erfolgsgarantie dargestellt.
