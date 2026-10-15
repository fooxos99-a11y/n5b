# Traditional Madani Mushaf display assets

These files supplement the existing canonical offline Mushaf. They do not replace
`pages/`, `index.json`, verse ranges, word locations, grading data, or API contracts.
Each numbered file maps a canonical word location to its matching V1 glyph,
printed V1 page, and printed V1 line. Some words have different printed pages
between the V1 and V2 editions; `manifest.json` records those cases.

Regenerate with `node scripts/generate-mushaf-v1-display.mjs`. The generator
checks coverage of every canonical word and validates all 604 WOFF2 downloads
before writing the supplemental package. Runtime readers use only local assets.

## Sources and attribution

- **Original calligraphy and fonts:** King Fahd Glorious Quran Printing Complex,
  Madani Mushaf, traditional V1 edition.
- **Font distribution:** [Quranic Universal Library (QUL), Tarteel AI](https://qul.tarteel.ai/resources/font/238).
  The resource's documentation explicitly describes bundling these fonts in
  Android/iOS applications and serving them from a site's own assets or CDN.
  Download source: `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v1-optimized/woff2/p{page}.woff2`.
- **Word glyph and layout mapping:** [Quran.com API word fields](https://api-docs.quran.com/docs/api/field-reference/),
  `code_v1`, `v1_page`, `line_v1`, joined to the existing canonical `location`.
- [QUL credits](https://qul.tarteel.ai/credits) attribute the original fonts to the
  King Fahd Quran Printing Complex.

Font ownership remains with its original rights holder. This project does not
claim that the fonts are MIT-licensed or that the assets are a separate reusable
font distribution. They are integrated assets for rendering Quran text in نخب.
