#!/usr/bin/env node
/**
 * Transpile-only build.
 *
 * `tsc` cannot type-check this project on every machine: the combination of
 * zod's deeply-recursive inferred types and the MCP SDK generics drives the
 * type checker into a multi-GB blow-up (heap OOM) during the check phase, even
 * with `--noEmit`. Since `isolatedModules: true` is set, every file can be
 * transpiled independently without the cross-file type graph, which is exactly
 * what `ts.transpileModule` does — fast and with bounded memory.
 *
 * Type errors are still caught separately via `npm run typecheck` (tsc --noEmit)
 * on machines/CI where the checker fits in memory.
 */
import { promises as fs } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const root = dirname(fileURLToPath(import.meta.url)) + '/..';
const srcDir = join(root, 'src');
const outDir = join(root, 'dist');

/** Recursively collect every .ts file under a directory. */
async function collect(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collect(full)));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const compilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  esModuleInterop: true,
  isolatedModules: true,
  sourceMap: true,
};

const files = await collect(srcDir);
let count = 0;

for (const file of files) {
  const source = await fs.readFile(file, 'utf-8');
  const rel = relative(srcDir, file);
  const { outputText, sourceMapText, diagnostics } = ts.transpileModule(source, {
    compilerOptions,
    fileName: file,
    reportDiagnostics: true,
  });

  if (diagnostics && diagnostics.length) {
    for (const d of diagnostics) {
      console.error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    }
    process.exitCode = 1;
  }

  const jsRel = rel.replace(/\.ts$/, '.js');
  const jsOut = join(outDir, jsRel);
  await fs.mkdir(dirname(jsOut), { recursive: true });

  const withMapRef = sourceMapText
    ? `${outputText}\n//# sourceMappingURL=${jsRel.split('/').pop()}.map\n`
    : outputText;
  await fs.writeFile(jsOut, withMapRef);
  if (sourceMapText) {
    await fs.writeFile(`${jsOut}.map`, sourceMapText);
  }
  count++;
}

console.error(`Transpiled ${count} file(s) to ${relative(root, outDir)}/`);
