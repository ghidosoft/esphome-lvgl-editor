import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve, basename, extname } from 'node:path';
import { isMap, isScalar, isSeq, type Node, type Document } from 'yaml';
import { parseDocument, isOpaqueScalar, toOpaqueMarker } from './yamlSchema';
import { mergePackages } from './packagesMerge';
import { applySubstitutions, normalizeSubsMap } from './substitutions';
import { normalizeProject } from './lvglNormalize';
import { FileRegistry } from './fileRegistry';
import { stampOrigin, type Origin, type OriginLeaf, type OriginNode } from './sourceMap';
import type { EsphomeProject, ParseError, YamlPath } from './types';

/**
 * Top-level entry point: read a main ESPHome YAML file and produce a
 * preview-ready EsphomeProject.
 *
 * Pipeline:
 *   1. parseDocument each file into a CST (preserved in FileRegistry)
 *   2. walk each Document producing a plain tree + a parallel origin tree
 *   3. resolve `!include` scalars by recursing into the target file
 *   4. merge `packages:` (deep) — origin propagates with the winner
 *   5. apply substitutions; mark single `${var}` scalars with viaVariable
 *   6. normalize into typed AST; populate project.sources + project.substitutions
 */
export function loadProject(mainPath: string, registry: FileRegistry = new FileRegistry()): EsphomeProject {
  const errors: ParseError[] = [];
  const name = basename(mainPath, extname(mainPath));
  const seen = new Set<string>();

  const loaded = loadAndResolve(mainPath, errors, seen, registry);
  if (!loaded || !isPlainObject(loaded.plain)) {
    return {
      name,
      sourcePath: mainPath,
      hasLvgl: false,
      display: { width: 480, height: 480 },
      fonts: {},
      styles: {},
      pages: [],
      errors: [
        ...errors,
        { kind: 'ProjectLoadError', message: 'main YAML did not parse to an object', path: mainPath },
      ],
      files: registry.allPaths(),
    };
  }

  const merged = mergePackages(
    loaded.plain as Record<string, unknown>,
    loaded.origin as Record<string, OriginNode>,
  );

  const subs = normalizeSubsMap((merged.plain as Record<string, unknown>).substitutions);
  const substituted = applySubstitutions(merged.plain, merged.origin, subs, errors);

  return normalizeProject({
    name,
    sourcePath: mainPath,
    doc: substituted.plain as Record<string, unknown>,
    origin: substituted.origin as OriginNode,
    subs,
    subsOrigin: findSubstitutionsOrigin(merged.origin),
    errors,
    files: registry.allPaths(),
  });
}

/** `true` for plain-object mappings (not arrays, not OpaqueTag markers). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Load a YAML file, register its Document, and walk it producing:
 *   - plain: JS object tree (what the renderer & normalizer consume)
 *   - origin: parallel tree of Origin leaves + stamped containers
 *
 * `!include` scalars are replaced by the resolved contents of the referenced
 * file. Cycles are detected via `seen`.
 */
export function loadAndResolve(
  filePath: string,
  errors: ParseError[],
  seen: Set<string>,
  registry: FileRegistry,
): { plain: unknown; origin: OriginNode } | null {
  const absolute = resolve(filePath);
  if (seen.has(absolute)) {
    errors.push({
      kind: 'IncludeMissing',
      message: `circular !include detected: ${absolute}`,
      path: absolute,
    });
    return null;
  }
  seen.add(absolute);

  let source: string;
  let mtime = 0;
  try {
    source = readFileSync(absolute, 'utf8');
    mtime = statSync(absolute).mtimeMs;
  } catch (e) {
    errors.push({
      kind: 'IncludeMissing',
      message: `cannot read ${absolute}: ${(e as Error).message}`,
      path: absolute,
    });
    seen.delete(absolute);
    return null;
  }

  let doc: Document.Parsed;
  try {
    doc = parseDocument(source);
  } catch (e) {
    errors.push({
      kind: 'ProjectLoadError',
      message: `YAML parse error in ${absolute}: ${(e as Error).message}`,
      path: absolute,
    });
    seen.delete(absolute);
    return null;
  }

  if (doc.errors.length) {
    for (const err of doc.errors) {
      errors.push({
        kind: 'ProjectLoadError',
        message: `YAML error in ${absolute}: ${err.message}`,
        path: absolute,
      });
    }
  }

  registry.register({ path: absolute, doc, mtime, raw: source });

  const result = walkNode(doc.contents as Node | null, absolute, dirname(absolute), [], errors, seen, registry);
  seen.delete(absolute);
  return result;
}

/**
 * Recursively convert a `yaml` CST Node into (plain, origin), resolving
 * `!include` along the way. `file` is the file this node lives in; `yamlPath`
 * is its path inside that file's Document.
 */
function walkNode(
  node: Node | null,
  file: string,
  baseDir: string,
  yamlPath: YamlPath,
  errors: ParseError[],
  seen: Set<string>,
  registry: FileRegistry,
): { plain: unknown; origin: OriginNode } {
  if (node == null) {
    return leaf(null, file, yamlPath);
  }

  if (isOpaqueScalar(node)) {
    const marker = toOpaqueMarker(node);
    if (marker.__tag === '!include') {
      const target = resolve(baseDir, marker.value);
      const sub = loadAndResolve(target, errors, seen, registry);
      if (!sub) return leaf(null, file, yamlPath);
      return sub;
    }
    // !secret / !lambda: opaque at render time, but with a real origin
    // (the file + path where the tag was written).
    return leaf(marker, file, yamlPath);
  }

  if (isScalar(node)) {
    return leaf(node.value as unknown, file, yamlPath);
  }

  if (isMap(node)) {
    const plain: Record<string, unknown> = {};
    const origin: Record<string, OriginNode> = {};
    for (const pair of node.items) {
      const keyNode = pair.key;
      const keyStr = isScalar(keyNode) ? String(keyNode.value) : String(keyNode);
      const childPath: YamlPath = [...yamlPath, keyStr];
      const child = walkNode(pair.value as Node | null, file, baseDir, childPath, errors, seen, registry);
      plain[keyStr] = child.plain;
      origin[keyStr] = child.origin;
    }
    stampOrigin(origin, { file, yamlPath });
    return { plain, origin };
  }

  if (isSeq(node)) {
    const plain: unknown[] = [];
    const origin: OriginNode[] = [];
    node.items.forEach((item, i) => {
      const childPath: YamlPath = [...yamlPath, i];
      const child = walkNode(item as Node | null, file, baseDir, childPath, errors, seen, registry);
      plain.push(child.plain);
      origin.push(child.origin);
    });
    stampOrigin(origin, { file, yamlPath });
    return { plain, origin };
  }

  // Aliases or unknown node kinds: best-effort fallthrough.
  return leaf((node as unknown as { value?: unknown }).value ?? null, file, yamlPath);
}

function leaf(value: unknown, file: string, yamlPath: YamlPath): { plain: unknown; origin: OriginLeaf } {
  return { plain: value, origin: { file, yamlPath: [...yamlPath] } };
}

/**
 * Locate the origin of `substitutions:` in the merged root. After `mergePackages`
 * it's the winner's origin (host-over-package), which is exactly where a
 * variable-value edit should be written.
 */
function findSubstitutionsOrigin(root: OriginNode): Origin | undefined {
  if (Array.isArray(root)) return undefined;
  if (typeof root !== 'object' || root === null) return undefined;
  const subs = (root as Record<string, OriginNode>)['substitutions'];
  if (!subs) return undefined;
  // Prefer the origin of the `substitutions:` mapping itself when available.
  if (Array.isArray(subs)) return undefined;
  if (typeof subs === 'object' && subs !== null) {
    const anyContainer = subs as Record<symbol, Origin | undefined>;
    const ORIGIN_KEY = Symbol.for('lvgl-editor.origin');
    const o = anyContainer[ORIGIN_KEY];
    if (o) return o;
  }
  return undefined;
}
