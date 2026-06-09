/**
 * Path safety helpers.
 *
 * This MCP server writes files to locations derived from tool inputs supplied
 * by an MCP client (an LLM). Sub-path parameters such as a request `folder` or
 * an environment `name` must never be able to escape the parent directory they
 * are meant to live in — otherwise a crafted `../../..` (or absolute) value
 * lets the server write `.bru` files anywhere the process can reach.
 */
import { resolve, relative, isAbsolute, sep } from 'path';
import { BrunoError } from './types.js';

/**
 * Resolve `segments` against `base` and assert the result stays inside `base`.
 *
 * Throws a `BrunoError` (code `PATH_TRAVERSAL`) if the resolved target escapes
 * the base directory via `..` traversal or an absolute-path segment.
 *
 * Note: `base` itself (e.g. a user-chosen `outputPath`/`collectionPath`) is an
 * intentional, caller-controlled root — this guard confines the *sub-paths*
 * within it, it does not restrict where the root may be.
 */
export function resolveWithin(base: string, ...segments: string[]): string {
  const root = resolve(base);
  const target = resolve(root, ...segments);
  const rel = relative(root, target);

  if (rel === '') {
    return target; // target === root
  }
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new BrunoError(
      `Path escapes its parent directory: '${segments.join('/')}'`,
      'PATH_TRAVERSAL'
    );
  }
  return target;
}
