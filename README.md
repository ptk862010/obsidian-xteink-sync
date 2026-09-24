# Xteink Sync

Send Obsidian notes to an **Xteink X3/X4** e-reader running **CrossPoint** firmware, as EPUB. No pandoc, no desktop app, works on desktop and mobile.

[Tiếng Việt](README.vi.md)

## Two destinations

| | Reader on Wi-Fi | Xteink Lover shelf |
| :--- | :--- | :--- |
| How | Pushes the EPUB straight into the reader | Uploads to your online shelf; the reader downloads it over OPDS |
| Needs | Reader in **File Transfer → Join Network**, on the same network | A free account at [Xteink Lover](https://app.xteinklover.workers.dev) (or your own self-hosted copy) and an app token |
| Works from anywhere | No | Yes, even when the reader is off |

Pick the destination in **Settings → Xteink Sync → Send to**.

## Three ways to send

1. **Send by hand**: right-click a note or folder → *Send to Xteink*, or run *Send current note*. With the reader on Wi-Fi and the reader not reachable, EPUBs wait in a queue (`.obsidian/plugins/xteink-sync/outbox`); run *Send queued files* later.
2. **One-click sync**: the ribbon icon or *Sync folders and tag* sends new and changed notes from the folders and tag you choose. Optionally removes files for notes that left the sync scope (only files this plugin sent).
3. **Auto-send new notes**: turn on *Send new notes automatically* and new notes in the watched folder are sent a few seconds after they appear. The default folder is `Clippings`, where [Obsidian Web Clipper](https://obsidian.md/clipper) saves, so clipping an article in the browser puts it on your reader in one step. Existing notes and edits are not sent.

Scope is inclusive: a folder includes all its subfolders. Notes outside the chosen folders are only sent if they carry the sync tag.

## Conversion

Notes are rendered with Obsidian's own Markdown renderer, so callouts, tables, embeds and links look like reading view. Images are scaled for e-ink and re-encoded as baseline JPEG (CrossPoint cannot show progressive JPEG or GIF). Mermaid diagrams and math are kept as source text, because the reader cannot draw them. Footnotes stay clickable.

## Setting up the Xteink Lover shelf

1. Sign in at https://app.xteinklover.workers.dev (password or Google).
2. **Account → App tokens → Create**, copy the token.
3. In Obsidian: *Send to* → *Xteink Lover shelf*, paste the token, press *Check*.
4. On the reader: add the OPDS server shown under **⚡ Connect** on the website.

5. Optional, instead of step 4: put the reader in **File Transfer → Join Network** and run **Connect reader to Xteink Lover shelf** (or the *Connect reader* button in settings). The plugin creates a new OPDS key and saves the "Xteink Lover" server on the reader over Wi-Fi (CrossPoint 1.6+), so you don't type anything on the reader. Readers still using the old key need the new one.

The token can list, add and remove books on your shelf, and create a new OPDS key for **Connect reader**. It cannot change your password or account, and you can revoke it on the website at any time.

## Network use

This plugin makes network requests only when you send or sync, or press *Check*:

- **Reader on Wi-Fi**: plain HTTP to the reader on your local network (`crosspoint.local` or the IP you set): `/api/status`, `/api/files`, `/upload`, `/mkdir`, `/delete`. CrossPoint has no login and no encryption, so only use this on a network you trust. `/delete` is only called for files this plugin sent, when *Remove when a note leaves the sync scope* is on.
- **Connect reader**: plain HTTP to the reader on your local network, `GET`/`POST /api/opds`, to save the shelf address, your username and the new OPDS key on the reader.
- **Xteink Lover shelf**: HTTPS to the server you set (default `https://app.xteinklover.workers.dev`), with your app token: list, upload and remove books. The EPUBs (your note content) are stored on that server. The hosted service runs on Cloudflare; you can self-host it instead ([source](https://github.com/ptk862010/xteinklover)).
- **Images from the web**: off by default. If you turn on *Download images from the web*, images that notes link with `https://` addresses are downloaded while converting (up to 10 MB each). Otherwise they are replaced by their alt text and nothing is fetched.

No telemetry, no analytics. Settings and sync history stay in the plugin's `data.json` in your vault.

## Development

```bash
npm install
npm test                                 # unit tests, no Obsidian needed
npm run lint                             # Obsidian's plugin review rules
npm run build                            # main.js
npm run install-vault -- <path-to-vault> # copy into a vault and enable
```

Releasing: bump `version` in `manifest.json` and `package.json`, add it to `versions.json` and a section to `CHANGELOG.md`, commit, then push a tag with the same number (no `v`). GitHub Actions tests, builds, attests and publishes the release.

Reader endpoints: `docs/webserver-endpoints.md` in [crosspoint-reader](https://github.com/crosspoint-reader/crosspoint-reader).

## License

MIT
