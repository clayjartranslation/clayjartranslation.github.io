# Clay Jar Translation JSON

`clay-jar-translation.json` is the whole draft in one file. © 2026 Jose Santiago.
Licensed under the Creative Commons Attribution 4.0 International License (CC BY 4.0):
https://creativecommons.org/licenses/by/4.0/

Suggested attribution: “Clay Jar Translation (CJT), © 2026 Jose Santiago, CC BY 4.0.”

Clay Jar Translation™, Clay Jar Treasure Bible™ and their logos are trademarks of Jose Santiago. The CC BY license covers the text, not the names or logos, which may be used only to credit the source.

This file is Draft 0.1.

The file is UTF-8 JSON. It is one object:

| Field | Meaning |
| --- | --- |
| `format` | Always `cjt-text`. |
| `version` | `2` for this shape. |
| `title` | Clay Jar Translation. |
| `edition` | Draft label, such as Draft 0.1. |
| `license` | `CC-BY-4.0`. |
| `licenseUrl` | https://creativecommons.org/licenses/by/4.0/ |
| `copyright` | © 2026 Jose Santiago. |
| `attribution` | Suggested credit line. |
| `trademark` | The names and logos are trademarks and are not covered by CC BY. |
| `language` | `en`. |
| `books` | Array of books, in reading order. |

Each book:

| Field | Meaning |
| --- | --- |
| `id` | Stable id, such as `genesis` or `1-samuel`. |
| `name` | English name. |
| `division` | Old Testament, Apocrypha, New Testament, or Pseudepigrapha. |
| `usfm` | Three-character id used in the USFM zip. Standard Paratext ids where they exist. The pseudepigrapha use short ids listed in the build script (`ENO` for 1 Enoch, `JUB` for Jubilees, `JAE` for Joseph and Aseneth, and so on). James keeps the standard id `JAS`. |
| `sourceNote` | Where that book was translated from. |
| `chapters` | Array of chapters that are in this draft. |

Each chapter:

| Field | Meaning |
| --- | --- |
| `n` | Chapter number. |
| `heading` | Optional section heading, or null. |
| `title` | Optional superscription, or null. Footnote markers may appear as `{a}`. |
| `paras` | Verse numbers where a new paragraph starts. |
| `subheads` | Optional map of verse number to a short heading, or null. |
| `verses` | Array of `{ "v": 1, "text": "..." }`. |
| `notes` | Array of `{ "m": "a", "ref": "1:1", "text": "..." }`. |

Verse `text` is the translation. A footnote marker is `{a}`, `{b}`, and so on, matching `notes[].m`. A line break inside `text` is a poetry line. Paragraph breaks are not inside the verse. They are `paras`.

The plain-text download prints the same words with the verse number in front and the marker as `[a]`. The USFM zip uses the `usfm` id as the file name and as `\id`.
