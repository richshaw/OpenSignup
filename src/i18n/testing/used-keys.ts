/**
 * Which catalog keys the app uses, as the type checker sees them, for the
 * unused-key part of the catalog check.
 *
 * It finds every call of a translator in `src/` (tests aside): `t(…)`,
 * `t.rich`, `t.markup`, `t.raw` and `t.has`, on whatever `getTranslator`,
 * `getServerTranslator`, `useTranslations` or `getTranslations` returned,
 * however it reached the call: a variable, a helper's parameter, a prop. A
 * call is a translator's when its signature is the one use-intl declares for
 * its `Translator` type, so a translator renamed, aliased or wrapped in a type
 * of our own is still found.
 *
 * The namespace comes from the type too: the keys a call accepts are exactly
 * those under its namespace, so the section of English whose keys they are is
 * the namespace. The key is the type of the call's first argument, which is
 * a literal for `t('help')` and a union of literals for a lookup in a typed
 * table (`t(STATUS_KEY[status])`) or a template over one.
 *
 * Translators are typed against the English passed in, not against
 * src/messages/en.d.json.ts, which lags en.json until the next `pnpm dev` or
 * `pnpm build` (messages-declaration.test.ts fails while it does). So the keys
 * a translator accepts are a section of that English even before the
 * declaration catches up.
 *
 * What it can't tell comes back in `unresolved` rather than being guessed: a
 * key typed as a plain `string` and a namespace that is a type parameter.
 */
import path from 'node:path';
import ts from 'typescript';
import type { Catalog } from './catalog-check';

/**
 * The app's code under `rootDir` as one TypeScript program, with its
 * tsconfig, and with a declaration written from `english` in place of
 * src/messages/en.d.json.ts. With `fixtures` (contents by absolute path), the
 * program is those files instead of the app's, read as if they were on disk.
 */
function createAppProgram(
  rootDir: string,
  english: Catalog,
  fixtures?: Readonly<Record<string, string>>,
): ts.Program {
  const config = ts.readConfigFile(path.join(rootDir, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, rootDir);
  const options = { ...parsed.options, incremental: false, noEmit: true };
  const host = ts.createCompilerHost(options);
  // What TypeScript reads for en.json's types (allowArbitraryExtensions).
  const overlay: Readonly<Record<string, string>> = {
    ...fixtures,
    [path.join(rootDir, 'src/messages/en.d.json.ts')]:
      `declare const messages: ${JSON.stringify(english)};\nexport default messages;\n`,
  };
  const { getSourceFile, fileExists, readFile, directoryExists } = host;
  host.getSourceFile = (fileName, languageVersion, ...rest) => {
    const text = overlay[fileName];
    return text === undefined
      ? getSourceFile.call(host, fileName, languageVersion, ...rest)
      : ts.createSourceFile(fileName, text, languageVersion, true);
  };
  host.fileExists = (fileName) => fileName in overlay || fileExists.call(host, fileName);
  host.readFile = (fileName) => overlay[fileName] ?? readFile.call(host, fileName);
  host.directoryExists = (directory) =>
    Object.keys(overlay).some((fileName) => fileName.startsWith(directory + path.sep)) ||
    (directoryExists?.call(host, directory) ?? true);
  const declarations = parsed.fileNames.filter((fileName) => fileName.endsWith('.d.ts'));
  const code = fixtures
    ? Object.keys(fixtures)
    : parsed.fileNames.filter((fileName) => isAppFile(rootDir, fileName));
  return ts.createProgram({ rootNames: [...declarations, ...code], options, host });
}

/**
 * Code that ships: under `src/`, but not a test, a test helper (in any
 * `testing` folder) or an eval (`src/mcp/evals`).
 */
function isAppFile(rootDir: string, fileName: string): boolean {
  const relative = path.relative(path.join(rootDir, 'src'), fileName);
  const folders = relative.split(path.sep).slice(0, -1);
  return (
    !relative.startsWith('..') &&
    !/\.test\.tsx?$/.test(relative) &&
    !folders.includes('testing') &&
    !relative.startsWith(path.join('mcp', 'evals') + path.sep)
  );
}

/**
 * The keys the app's code under `rootDir` uses, in full (`common.footer.help`),
 * with translators typed against `english`. With `fixtures`, the code is those
 * files instead (see `createAppProgram`).
 */
export function findUsedKeys(
  rootDir: string,
  english: Catalog,
  fixtures?: Readonly<Record<string, string>>,
): { used: Set<string>; unresolved: string[] } {
  const program = createAppProgram(rootDir, english, fixtures);
  const checker = program.getTypeChecker();
  const sections = sectionsOf(english);
  const used = new Set<string>();
  const unresolved: string[] = [];

  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || !isAppFile(rootDir, file.fileName)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) record(file, node);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { used, unresolved };

  function record(file: ts.SourceFile, call: ts.CallExpression): void {
    // Non-nullable, so that `t?.('help')` is seen.
    const signature = checker
      .getNonNullableType(checker.getTypeAtLocation(call.expression))
      .getCallSignatures()
      .find(isTranslatorSignature);
    if (!signature) return;
    const { line } = file.getLineAndCharacterOfPosition(call.getStart(file));
    const where = `${path.relative(rootDir, file.fileName)}:${line + 1}: ${call.expression.getText(file)}`;

    const accepted = literals(signature.getTypeParameters()?.[0]?.getConstraint());
    const candidates = accepted ? namespacesAccepting(sections, accepted) : [];
    if (candidates.length === 0) {
      unresolved.push(`${where}: can't tell which namespace this translator reads`);
      return;
    }
    const argument = call.arguments[0];
    const keys = argument && literals(checker.getTypeAtLocation(argument));
    if (!keys?.length) {
      unresolved.push(
        `${where}: can't tell which key this is. Name keys literally; map a value to its key through a typed table (const STATUS_KEY = { open: 'status.open' } as const)`,
      );
      return;
    }
    for (const namespace of candidates) {
      for (const key of keys) used.add(namespace ? `${namespace}.${key}` : key);
    }
  }
}

/** Whether `signature` is one use-intl declares on its `Translator` type. */
function isTranslatorSignature(signature: ts.Signature): boolean {
  const literal = signature.getDeclaration()?.parent;
  const alias = literal?.parent;
  return (
    alias !== undefined &&
    ts.isTypeLiteralNode(literal) &&
    ts.isTypeAliasDeclaration(alias) &&
    alias.name.text === 'Translator' &&
    /[\\/]use-intl[\\/]/.test(alias.getSourceFile().fileName)
  );
}

/** The string values of a literal type or a union of them, else null. */
function literals(type: ts.Type | undefined): string[] | null {
  if (!type) return null;
  const members = type.isUnion() ? type.types : [type];
  return members.every((member) => member.isStringLiteral())
    ? members.map((member) => (member as ts.StringLiteralType).value)
    : null;
}

type Section = { namespace: string; keys: ReadonlySet<string> };

/** Each section of English (the root as ''), with its messages' keys relative to it. */
function sectionsOf(english: Catalog): Section[] {
  const sections: Section[] = [];
  const walk = (section: Catalog, namespace: string): void => {
    sections.push({ namespace, keys: new Set(messageKeys(section, '')) });
    for (const [key, value] of Object.entries(section)) {
      if (typeof value !== 'string') walk(value, namespace ? `${namespace}.${key}` : key);
    }
  };
  walk(english, '');
  return sections;
}

/**
 * The namespaces whose messages are exactly the keys a translator accepts.
 * Two sections with the same keys both count, so a use of either counts for
 * both.
 */
function namespacesAccepting(sections: readonly Section[], accepted: readonly string[]): string[] {
  return sections
    .filter(
      (section) =>
        section.keys.size === accepted.length && accepted.every((key) => section.keys.has(key)),
    )
    .map((section) => section.namespace);
}

function messageKeys(section: Catalog, prefix: string): string[] {
  return Object.entries(section).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : messageKeys(value, `${prefix}${key}.`),
  );
}
