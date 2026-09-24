# Changelog

## 0.2.0

- New command **Connect reader to Xteink Lover shelf** (also a button in settings): with the reader in File Transfer mode, the plugin creates a new OPDS key and saves the shelf on the reader over Wi-Fi. No more typing the address and key on the e-reader. Needs CrossPoint 1.6 or later.
- In shelf mode, the reader address setting is shown too (used by Connect reader).

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
