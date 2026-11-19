# PDF fonts

`QingAnSans-Regular.ttf` and `QingAnSans-Bold.ttf` are derived from Noto Sans SC,
distributed by `@fontsource-variable/noto-sans-sc@5.3.1` (upstream Google Fonts v41).
The upstream SIL Open Font License is included in `OFL.txt`.

The 101 WOFF2 subsets are instantiated at weights 400/700 and merged into static
TrueType fonts. Shaping tables unnecessary for this Chinese report export are
removed, and the derivative family is renamed to QingAn Sans. See
`scripts/build_report_font.py` for the reproducible build. No network or font
installation is needed to export a PDF; each PDF embeds only the glyphs it uses.

Sources: https://fontsource.org/fonts/noto-sans-sc and https://github.com/google/fonts
