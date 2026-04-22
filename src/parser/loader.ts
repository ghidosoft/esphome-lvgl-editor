import { readFileSync } from 'node:fs';
import { dirname, resolve, basename, extname } from 'node:path';
import { parseYaml } from './yamlSchema';
import { mergePackages } from './packagesMerge';
import { applySubstitutions, normalizeSubsMap } from './substitutions';
import { normalizeProject } from './lvglNormalize';
import { isOpaqueTag } from './types';
import type { EsphomeProject, ParseError } from './types';

/**
 * Top-level entry point: read a main ESPHome YAML file and produce a
 * preview-ready EsphomeProject.
 *
 * Pipeline:
 *   1. parse main → raw doc (with !include/!secret/!lambda preserved)
 *   2. resolve `packages: { name: !include path }` recursively
 *   3. expand `lvgl.pages: [!include …]` to inline objects
 *   4. collect substitutions from doc + packages, regex-substitute everywhere
 *   5. normalize into typed AST
 */
export function loadProject(mainPath: string): EsphomeProject {
  const errors: ParseError[] = [];
  const name = basename(mainPath, extname(mainPath));
  const seen = new Set<string>();

  const rawMain = loadAndResolve(mainPath, errors, seen);
  if (!rawMain || typeof rawMain !== 'object' || Array.isArray(rawMain)) {
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
    };
  }

  // 1. Merge packages (deep) into root
  const merged = mergePackages(rawMain as Record<string, unknown>);

  // 2. Collect substitutions (root-level only — same semantics as ESPHome)
  const subs = normalizeSubsMap((merged as Record<string, unknown>).substitutions);

  // 3. Apply substitutions everywhere
  const substituted = applySubstitutions(merged, subs, errors) as Record<string, unknown>;

  // 4. Normalize into typed project
  return normalizeProject({ name, sourcePath: mainPath, doc: substituted, errors });
}

/**
 * Load a YAML file and recursively resolve every !include scalar inside it.
 * Tracks `seen` to avoid include cycles.
 */
function loadAndResolve(filePath: string, errors: ParseError[], seen: Set<string>): unknown {
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
  try {
    source = readFileSync(absolute, 'utf8');
  } catch (e) {
    errors.push({
      kind: 'IncludeMissing',
      message: `cannot read ${absolute}: ${(e as Error).message}`,
      path: absolute,
    });
    seen.delete(absolute);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (e) {
    errors.push({
      kind: 'ProjectLoadError',
      message: `YAML parse error in ${absolute}: ${(e as Error).message}`,
      path: absolute,
    });
    seen.delete(absolute);
    return null;
  }

  const resolved = resolveIncludes(parsed, dirname(absolute), errors, seen);
  seen.delete(absolute);
  return resolved;
}

/**
 * Walk a parsed YAML value and replace every OpaqueTag('!include') with the
 * loaded contents of the referenced file (relative to baseDir).
 *
 * !secret and !lambda are preserved as opaque tags — the renderer will treat
 * them as placeholders. !include is purely structural so it must vanish here.
 */
function resolveIncludes(
  value: unknown,
  baseDir: string,
  errors: ParseError[],
  seen: Set<string>,
): unknown {
  if (isOpaqueTag(value)) {
    if (value.__tag !== '!include') return value;
    const target = resolve(baseDir, value.value);
    return loadAndResolve(target, errors, seen);
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveIncludes(v, baseDir, errors, seen));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveIncludes(v, baseDir, errors, seen);
    }
    return out;
  }
  return value;
}
