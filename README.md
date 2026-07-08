# Einblas-Protokoll → Aufmaß

Reine Frontend-App (kein Backend, kein Build-Schritt) für GitHub Pages.
PDF rein → zwei fertig ausgefüllte xlsx + optional PDF raus, als
ZIP-Archiv mit dem Namen der PDF-Datei.

## Struktur

```
index.html          Seite + Editor-UI
css/main.css         Styling
js/xlsx-patch.js      Schreibt Werte direkt in die xlsx-XML (JSZip),
                       ohne Schrift/Format/Logo anzufassen
js/pdf-fields.js       Liest Seite 1 des PDFs (pdf.js), erkennt die Felder
js/pdf-edit.js          Übermalt geänderte Felder im PDF mit dem neuen Wert
js/settings.js          Zentrale Einstellungen: PDF in ZIP ja/nein, PDF-Edit ja/nein usw.
js/main.js               Ablauf: Drop → Editor → Generieren → automatischer Download mit sichtbarer Download-Schaltfläche als Fallback
json/rules.json           Zuordnung Feld → Zelle (zentral, hier anpassen)
files/Aufmaß_Montage.xlsx  Vorlage (Original, Formatierung/Logo bleiben erhalten)
files/Mat.-Liste_GF_1.xlsx Vorlage
```

## Deployment

1. Repo anlegen, diesen Ordner-Inhalt (nicht den Ordner selbst) ins Root
   des Repos pushen.
2. GitHub → Settings → Pages → Source: "Deploy from branch", Branch `main`, `/ (root)`.
3. Fertig – die Seite lädt pdf.js / pdf-lib / JSZip von cdnjs.cloudflare.com,
   sonst braucht es nichts weiter.

## Was die App tut

- Nur die erste Tabelle des PDFs (alles vor "Prozess Diagramm") wird gelesen
  und im Editor gezeigt. Der Rest des PDFs wird nicht angetastet.
- Aktiv/editierbar sind genau die Felder, die ihr auf Papier gelb markiert:
  Firma, Bauvorhaben-Nr., Datum, Streckenabschnitt (NVt + Adresse), Bediener,
  Fasern, Strecke. Dazu ein manuelles Feld "Ort", weil die Stadt im PDF nicht
  vorkommt.
- Fasern bestimmt, in welche Zeile der Mat.-Liste (34–38) die Strecke
  geschrieben wird; die anderen vier Zeilen werden dabei geleert.
- Bediener: erster Name → "Mitarbeiter" Zeile 1, weitere (kommagetrennt)
  → Zeile 2.
- Wird ein Feld im Editor geändert, wird das PDF an genau der Stelle mit
  einer weißen Box übermalt und der neue Wert draufgeschrieben – der Rest
  des PDFs bleibt byte-identisch.

## Bekannte Einschränkung

Das Übermalen im PDF ist rein optisch: die alte Zahl/den alten Text löscht
das nicht aus der unsichtbaren Textebene des PDFs (nur eine weiße Fläche
+ neuer Text obendrüber). Optisch/beim Ausdrucken ist es korrekt; wer aber
gezielt an der Stelle Text markiert und kopiert, kann noch den alten Wert
darunter finden. Ein echtes "Ersetzen" im Content-Stream ist mit reinem
Browser-JavaScript ohne Zusatz-Server nicht robust machbar. Wenn das zum
Problem wird, sagt Bescheid – dann bauen wir eine zweite Variante, die
Seite 1 komplett neu zeichnet statt zu überkleben.

Firma wird 1:1 aus dem PDF übernommen (keine automatische Kürzung wie im
Beispiel "Schneider-Winter" statt "Schneider + Winter GmbH") – so wie
gewünscht.

## rules.json anpassen

Neue Firma-Kürzel, andere Zellen, neue Felder – alles zentral in
`json/rules.json`, ohne den Rest des Codes anzufassen (siehe `targets`).


## Änderungen dieser Version

- ZIP bleibt ZIP, kein RAR.
- Editor bleibt erhalten, damit fehlerhafte Plumettaz-Werte korrigiert werden können.
- Mat.-Liste: Strecke wird in Spalte D der passenden Faser-Zeile geschrieben, nicht in B.
- Datum für Mat.-Liste bleibt auf D1 mit Format TT.MM.JJJJ.
- Beim Packen läuft eine Fortschrittsanzeige; danach wird der Download automatisch angestoßen, Button bleibt als Reserve sichtbar.


## settings.js

Die wichtigste Einstellung liegt in `js/settings.js`:

```js
const SETTINGS = {
  pdf: {
    include: true,          // true = PDF kommt in ZIP, false = PDF kommt NICHT in ZIP
    editChangedFields: true // true = geänderte PDF-Felder optisch ins PDF schreiben
  },
  excel: {
    aufmass: true,
    material: true
  },
  archive: {
    autoDownload: true,
    compression: 'DEFLATE'
  },
  ui: {
    showLoader: true,
    debug: false
  }
};
```

Wenn du kein PDF im Archiv willst:

```js
pdf: {
  include: false,
  editChangedFields: true
}
```

Dann enthält das ZIP nur:

- `Aufmaß_Montage.xlsx`
- `Mat.-Liste_GF_1.xlsx`

Wenn du PDF im Archiv willst, aber ohne PDF-Bearbeitung:

```js
pdf: {
  include: true,
  editChangedFields: false
}
```

Dann enthält das ZIP den originalen PDF + beide Excel-Dateien.
