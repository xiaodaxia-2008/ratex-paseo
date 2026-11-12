# Bundled Chinese fallback font

`NotoSansSC-Regular.woff` is derived from Noto Sans CJK, licensed under SIL OFL 1.1
(see `OFL.txt`). It covers the source font's Basic Multilingual Plane characters,
including common simplified/traditional Chinese and punctuation. Supplementary-plane
characters and emoji are not guaranteed; missing glyphs fall back to LaTeX source.

Source: https://github.com/notofonts/noto-cjk/blob/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf

Source SHA-256: `d68bafcb48a2707749396aa12bbbd833cb70401f3a9a689fd2902c7e0d295964`.
Output SHA-256: `d4924010b7f1709fae860875a46a0613d4fcd4f5bed12a4cbcb2838045c423dc`.

Preparation used fontTools 4.68.0: instantiate the `wght` axis at 400, subset to
U+0000–U+FFFF with no layout features, then save as WOFF. The tracked font is
embedded into a generated server-only TypeScript data module by `npm run prepare`.
No Python, font download, or system font discovery is needed during installation.

The embedded CJK data adds approximately 8.2 MB to the daemon bundle. This fork
therefore exceeds the upstream community catalog's 2 MB runtime-source budget;
it is intended for direct Git installation. Its generated font data has a separate
12 MB package-check limit, while the original source budget is still checked.
