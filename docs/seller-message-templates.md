# Seller Message Templates

## English — Full (eBay, forums, email)

```
Hi! I'm interested in your [DRIVE MODEL].

Before purchasing, could you run a quick drive health check?
It takes 2 minutes and shows SMART data (hours, errors, temperature).

Run this single command in terminal/command prompt:

    npx drive-check dc-XXXXXXXXXXXX

Requirements: Node.js (https://nodejs.org) and smartmontools.
The tool guides you through installing smartmontools if needed.

The tool is open-source — you can read every line of code:
https://github.com/vladimir-ks/drive-check

It does NOT access your files or collect any personal info.
You'll see the full report before it sends, and can cancel anytime.

If you prefer not to run the tool, I'll also accept:
- A screenshot of CrystalDiskInfo (Windows)
- Output of: smartctl -a /dev/sdX (Linux/Mac)
- Any SMART health report with serial number visible

Thanks!
```

## English — Short (character-limited platforms)

```
Quick SMART check before purchase?
2 min: npx drive-check dc-XXXXXXXXXXXX
Open-source, read-only. Code: github.com/vladimir-ks/drive-check
Or send CrystalDiskInfo screenshot. Thanks!
```

## German (eBay.de / Kleinanzeigen)

```
Hallo! Ich interessiere mich für Ihre [FESTPLATTE].

Könnten Sie vor dem Kauf einen kurzen Gesundheitscheck der
Festplatte durchführen? Dauert 2 Minuten, zeigt SMART-Daten
(Betriebsstunden, Fehler, Temperatur).

Einfach diesen Befehl im Terminal ausführen:

    npx drive-check dc-XXXXXXXXXXXX

Benötigt: Node.js (https://nodejs.org) und smartmontools.
Das Tool ist Open-Source — Sie können jede Zeile Code lesen:
https://github.com/vladimir-ks/drive-check

Es greift NICHT auf Ihre Dateien zu und sammelt keine
persönlichen Daten. Sie sehen den vollständigen Bericht
bevor er gesendet wird.

Alternativ akzeptiere ich auch:
- Screenshot von CrystalDiskInfo (Windows)
- Ausgabe von: smartctl -a /dev/sdX (Linux/Mac)

Danke!
```

## Russian (Avito / marketplace)

```
Здравствуйте! Интересует ваш [ДИСК].

Не могли бы вы запустить быструю проверку здоровья диска?
Занимает 2 минуты, показывает SMART-данные (часы работы,
ошибки, температуру).

Команда для терминала:

    npx drive-check dc-XXXXXXXXXXXX

Нужен Node.js (https://nodejs.org) и smartmontools.
Инструмент с открытым кодом — можно прочитать каждую строку:
https://github.com/vladimir-ks/drive-check

НЕ обращается к файлам и НЕ собирает личные данные.
Вы увидите полный отчёт перед отправкой.

Если не хотите запускать — пришлите скриншот CrystalDiskInfo.

Спасибо!
```

## Fallback Options (when seller won't run any tool)

If seller refuses any tool, request manually:

### Windows
```
Please download CrystalDiskInfo (free):
https://crystalmark.info/en/software/crystaldiskinfo/

Open it, make sure the drive is selected, and send me a screenshot.
I need to see: model, serial, hours, temperature, and health status.
```

### Linux/macOS
```
Please run in terminal:
  sudo smartctl -a /dev/sdX

(replace /dev/sdX with your drive, e.g., /dev/sdb)

Copy-paste the full output and send it to me.
```

### If seller won't do anything
Move to next seller. A drive without health data is not worth the risk at any price.
