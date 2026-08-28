# Brewlet

[English](README.md) | [简体中文](README.zh-CN.md)

> Free & open-source macOS GUI for Homebrew.

Brewlet is a free & open-source graphical management tool for **Homebrew** on macOS, built with **Tauri 2 (Rust) + React 19 / TypeScript**. It is a visual shell for the Homebrew CLI — it never hijacks or replaces the CLI. Every operation is ultimately handled by the official Homebrew command line and its JSON data sources (`brew --json=v2` / `formulae.brew.sh`).

## Features

- **Catalog browse & search**: filter Formula / Cask by type and status (installed / upgradable / pinned / keg-only / deprecated); virtualized scrolling handles thousands of entries
- **Package management**: installed list, outdated list, per-package install / upgrade / uninstall with live progress and cancellation
- **Dependency graph**: forward + reverse dependency visualization (dagre layout), drill into a node and navigate back, adjustable depth
- **Global search**: persistent toolbar search (⌘K to focus), lists support ↑↓ / Home / End keyboard navigation
- **Settings panel**: brew path override, network proxy (single address injected into HTTP / HTTPS / ALL_PROXY), China mirror sources (Tsinghua / USTC / custom)
- **Maintenance operations**: `brew update` / `upgrade` / `cleanup` / `autoremove`
- **Mirror connectivity test**: test all proxy + mirror sources in one click
- **UX details**: collapsible three-column layout, native macOS title bar, dark mode, Escape shortcut semantics, operation queue

## Screenshots

| Installed | Dependency graph | Settings |
|---|---|---|
| ![Installed](screenshots/installed.png) | ![Dependency graph](screenshots/dependency-graph.png) | ![Settings](screenshots/settings.png) |

## Install

Download the latest `.dmg` from [Releases](https://github.com/workerOn9/brewlet/releases).

The current build is **unsigned**. On first open, right-click the app → **Open** to confirm, or go to **System Settings → Privacy & Security → Open Anyway**. If it still shows "Damaged / cannot be opened", clear the quarantine attribute and re-sign (ad-hoc) locally:

```bash
xattr -cr /Applications/Brewlet.app
codesign --force --deep --sign - /Applications/Brewlet.app
```

The current artifact is **Apple Silicon (aarch64)**.

## Build from source

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/)
- [Xcode Command Line Tools](https://developer.apple.com/xcode/)
- [Homebrew](https://brew.sh/)

### Develop

```bash
bun install
bun run tauri dev
```

### Package DMG

```bash
bun run tauri build
```

Output goes to `src-tauri/target/release/bundle/dmg/`.

To publish to GitHub: push a `v*` tag (e.g. `v0.1.0`); [GitHub Actions](.github/workflows/release.yml) builds and uploads the DMG to the Release automatically.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop | Tauri 2 (tokio / serde / reqwest) |
| Frontend | React 19 + TypeScript (strict) + Vite |
| State | @tanstack/react-query (server) + zustand (UI) |
| UI | Tailwind CSS v4 + lucide-react |
| Large lists | @tanstack/react-virtual |
| Graph | @xyflow/react + @dagrejs/dagre |

## Design constraints

All data flows through structured JSON — never parse terminal text blindly. Zero password handling (privileged operations go through system authorization). End-to-end type safety (TS strict, no `unwrap` in Rust).

## License

[Apache-2.0](LICENSE)
