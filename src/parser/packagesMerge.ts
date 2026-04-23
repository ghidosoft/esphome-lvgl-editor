import { isOpaqueTag } from './types';
import { stampOrigin, readOrigin, type OriginNode } from './sourceMap';

/**
 * ESPHome `packages:` merge semantics: each value resolves to a YAML document
 * that is deep-merged into the host. Scalars from the host win; arrays from
 * the host replace; objects merge recursively.
 *
 * This version merges the plain tree *and* the parallel origin tree in
 * lockstep, so after the merge each value still knows which source file it
 * came from (host file or the specific package file).
 */
export function mergePackages(
  plainRoot: Record<string, unknown>,
  originRoot: Record<string, OriginNode>,
): { plain: Record<string, unknown>; origin: Record<string, OriginNode> } {
  const packages = plainRoot.packages;
  const packagesOrigin = originRoot.packages;
  if (!packages || typeof packages !== 'object' || isOpaqueTag(packages) || Array.isArray(packages)) {
    return { plain: plainRoot, origin: originRoot };
  }

  let outPlain: Record<string, unknown> = {};
  let outOrigin: Record<string, OriginNode> = {};
  const packagesOriginMap =
    typeof packagesOrigin === 'object' && packagesOrigin !== null && !Array.isArray(packagesOrigin)
      ? (packagesOrigin as Record<string, OriginNode>)
      : {};

  // Apply packages first (they form the base).
  for (const [pkgName, value] of Object.entries(packages as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const pkgOrigin = packagesOriginMap[pkgName];
    if (!pkgOrigin || Array.isArray(pkgOrigin)) continue;
    const merged = deepMerge(
      outPlain,
      outOrigin,
      value as Record<string, unknown>,
      pkgOrigin as Record<string, OriginNode>,
    );
    outPlain = merged.plain;
    outOrigin = merged.origin;
  }

  // Then apply the host on top (host wins), minus the `packages:` key.
  const hostPlain: Record<string, unknown> = { ...plainRoot };
  const hostOrigin: Record<string, OriginNode> = { ...originRoot };
  delete hostPlain.packages;
  delete hostOrigin.packages;
  const finalMerge = deepMerge(outPlain, outOrigin, hostPlain, hostOrigin);

  // Preserve the host's container origin on the merged root.
  const hostRootOrigin = readOrigin(originRoot);
  if (hostRootOrigin) stampOrigin(finalMerge.origin, hostRootOrigin);

  return { plain: finalMerge.plain, origin: finalMerge.origin };
}

function deepMerge(
  basePlain: Record<string, unknown>,
  baseOrigin: Record<string, OriginNode>,
  overlayPlain: Record<string, unknown>,
  overlayOrigin: Record<string, OriginNode>,
): { plain: Record<string, unknown>; origin: Record<string, OriginNode> } {
  const outPlain: Record<string, unknown> = { ...basePlain };
  const outOrigin: Record<string, OriginNode> = { ...baseOrigin };

  for (const [k, v] of Object.entries(overlayPlain)) {
    const prev = outPlain[k];
    const prevOrigin = outOrigin[k];
    const vOrigin = overlayOrigin[k];

    const canMerge =
      prev &&
      v &&
      typeof prev === 'object' &&
      typeof v === 'object' &&
      !Array.isArray(prev) &&
      !Array.isArray(v) &&
      !isOpaqueTag(prev) &&
      !isOpaqueTag(v) &&
      prevOrigin &&
      vOrigin &&
      !Array.isArray(prevOrigin) &&
      !Array.isArray(vOrigin) &&
      typeof prevOrigin === 'object' &&
      typeof vOrigin === 'object';

    if (canMerge) {
      const merged = deepMerge(
        prev as Record<string, unknown>,
        prevOrigin as Record<string, OriginNode>,
        v as Record<string, unknown>,
        vOrigin as Record<string, OriginNode>,
      );
      outPlain[k] = merged.plain;
      outOrigin[k] = merged.origin;
    } else {
      outPlain[k] = v;
      outOrigin[k] = vOrigin;
    }
  }

  return { plain: outPlain, origin: outOrigin };
}
