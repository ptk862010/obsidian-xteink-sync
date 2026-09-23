# Changelog

## 0.1.1

- Replaced the ZIP library (JSZip → fflate). The plugin is now about a third of the size, and it no longer bundles old browser polyfills that created script elements.
- The EPUB table of contents title follows the interface language.
- Releases are now built by GitHub Actions and carry build provenance attestations.

## 0.1.0

First release.

- Send notes to an Xteink e-reader (CrossPoint firmware) as EPUB, over Wi-Fi or through an Xteink Lover online shelf.
- One-click sync of folders and a tag.
- Auto-send new notes from a folder (`Clippings` by default, for Obsidian Web Clipper).
- English and Vietnamese interface.
