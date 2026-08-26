/**
 * Merged view model: unify Formula / Cask into a single PackageRow by merging
 * catalog (formulae.brew.sh) + installed (brew list --json=v2) + outdated
 * (brew outdated --json=v2) data.
 *
 * Keys: formula = `name`, cask = `token` (outdated cask entries are keyed by
 * name == token). `installed` semantics: formula -> installed.length > 0,
 * cask -> installed != null (string version). `outdated` is driven solely by
 * getOutdated — the authoritative local source.
 */
import type {
  CatalogPayload,
  Cask,
  Formula,
  InfoOutput,
  OutdatedOutput,
  PackageKind,
} from "../types";

export interface PackageRow {
  id: string;
  kind: PackageKind;
  /** Wire key: formula name / cask token. */
  name: string;
  /** Cask: name[0] (fallback token); formula: name. */
  displayName: string;
  desc: string | null;
  /** Latest upstream version (formula versions.stable / cask version). */
  version: string | null;
  installed: boolean;
  installedVersion: string | null;
  outdated: boolean;
  /** Latest version when outdated (from brew outdated). */
  currentVersion: string | null;
  pinned: boolean;
  kegOnly: boolean;
  deprecated: boolean;
  homepage: string | null;
  license: string | null;
  tap: string | null;
  dependencies: string[];
  linkedKeg: string | null;
  installedVersions: string[];
}

export type KindFilter = "all" | "formula" | "cask";
export type StatusFilter =
  | "installed"
  | "outdated"
  | "pinned"
  | "kegOnly"
  | "deprecated";

export function packageId(kind: PackageKind, name: string): string {
  return `${kind}:${name}`;
}

function fromFormula(f: Formula): PackageRow {
  const installedVersions = f.installed.map((v) => v.version);
  return {
    id: packageId("formula", f.name),
    kind: "formula",
    name: f.name,
    displayName: f.name,
    desc: f.desc,
    version: f.versions.stable,
    installed: f.installed.length > 0,
    installedVersion: installedVersions[0] ?? null,
    outdated: false,
    currentVersion: null,
    pinned: f.pinned,
    kegOnly: f.keg_only,
    deprecated: f.deprecated,
    homepage: f.homepage,
    license: f.license,
    tap: f.tap,
    dependencies: f.dependencies,
    linkedKeg: f.linked_keg,
    installedVersions,
  };
}

function fromCask(c: Cask): PackageRow {
  return {
    id: packageId("cask", c.token),
    kind: "cask",
    name: c.token,
    displayName: c.name[0] ?? c.token,
    desc: c.desc,
    version: c.version,
    installed: c.installed != null,
    installedVersion: c.installed,
    outdated: false,
    currentVersion: null,
    pinned: c.pinned,
    kegOnly: false,
    deprecated: c.deprecated,
    homepage: c.homepage,
    license: null,
    tap: c.tap,
    dependencies: [],
    linkedKeg: null,
    installedVersions: c.installed != null ? [c.installed] : [],
  };
}

/** Overlay local `brew list` data onto a catalog-seeded row (local wins for
 * install state; catalog keeps metadata unless absent). */
function overlayFormula(row: PackageRow, f: Formula): PackageRow {
  const versions = f.installed.map((v) => v.version);
  const installedVersions =
    versions.length > 0 ? versions : row.installedVersions;
  return {
    ...row,
    desc: row.desc ?? f.desc,
    homepage: row.homepage ?? f.homepage,
    license: row.license ?? f.license,
    version: row.version ?? f.versions.stable,
    installed: f.installed.length > 0 || row.installed,
    installedVersion: installedVersions[0] ?? null,
    installedVersions,
    pinned: f.pinned,
    kegOnly: f.keg_only,
    linkedKeg: f.linked_keg ?? row.linkedKeg,
    dependencies:
      row.dependencies.length > 0 ? row.dependencies : f.dependencies,
    deprecated: row.deprecated || f.deprecated,
  };
}

function overlayCask(row: PackageRow, c: Cask): PackageRow {
  const installed = c.installed != null || row.installed;
  const installedVersion = c.installed ?? row.installedVersion;
  return {
    ...row,
    desc: row.desc ?? c.desc,
    homepage: row.homepage ?? c.homepage,
    version: row.version ?? c.version,
    installed,
    installedVersion,
    installedVersions:
      installedVersion != null ? [installedVersion] : row.installedVersions,
    pinned: c.pinned,
    deprecated: row.deprecated || c.deprecated,
  };
}

export function buildPackages(
  catalog: CatalogPayload | undefined,
  installed: InfoOutput | undefined,
  outdated: OutdatedOutput | undefined,
): PackageRow[] {
  const map = new Map<string, PackageRow>();

  if (catalog) {
    for (const f of catalog.formulae) {
      map.set(packageId("formula", f.name), fromFormula(f));
    }
    for (const c of catalog.casks) {
      map.set(packageId("cask", c.token), fromCask(c));
    }
  }
  if (installed) {
    for (const f of installed.formulae) {
      const id = packageId("formula", f.name);
      const existing = map.get(id);
      map.set(id, existing ? overlayFormula(existing, f) : fromFormula(f));
    }
    for (const c of installed.casks) {
      const id = packageId("cask", c.token);
      const existing = map.get(id);
      map.set(id, existing ? overlayCask(existing, c) : fromCask(c));
    }
  }
  if (outdated) {
    for (const o of outdated.formulae) {
      const row = map.get(packageId("formula", o.name));
      if (row) {
        row.outdated = true;
        row.currentVersion = o.current_version;
      }
    }
    for (const o of outdated.casks) {
      const row = map.get(packageId("cask", o.name));
      if (row) {
        row.outdated = true;
        row.currentVersion = o.current_version;
      }
    }
  }
  return [...map.values()];
}

export function matchesStatus(row: PackageRow, filter: StatusFilter): boolean {
  switch (filter) {
    case "installed":
      return row.installed;
    case "outdated":
      return row.outdated;
    case "pinned":
      return row.pinned;
    case "kegOnly":
      return row.kegOnly;
    case "deprecated":
      return row.deprecated;
  }
}

/** Prefix match beats substring match beats description match. */
function matchTier(row: PackageRow, q: string): number | null {
  const name = row.name.toLowerCase();
  const display = row.displayName.toLowerCase();
  if (name.startsWith(q) || display.startsWith(q)) return 0;
  if (name.includes(q) || display.includes(q)) return 1;
  const desc = row.desc?.toLowerCase();
  if (desc !== undefined && desc.includes(q)) return 2;
  return null;
}

export function filterPackages(
  rows: PackageRow[],
  query: string,
  kind: KindFilter,
  status: StatusFilter | null,
): PackageRow[] {
  let out = rows;
  if (kind !== "all") {
    out = out.filter((r) => r.kind === kind);
  }
  if (status !== null) {
    out = out.filter((r) => matchesStatus(r, status));
  }
  const q = query.trim().toLowerCase();
  if (q.length > 0) {
    const scored: { row: PackageRow; tier: number }[] = [];
    for (const row of out) {
      const tier = matchTier(row, q);
      if (tier !== null) scored.push({ row, tier });
    }
    scored.sort(
      (a, b) => a.tier - b.tier || a.row.name.localeCompare(b.row.name),
    );
    out = scored.map((s) => s.row);
  }
  return out;
}

export function byInstalled(a: PackageRow, b: PackageRow): number {
  return a.name.localeCompare(b.name);
}
