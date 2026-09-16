/**
 * Splits recognized named imports of `oldPackage` into a single new combined import of `newPackage`,
 * renaming any specifier whose old/new names differ — both the import specifier itself and every other
 * reference to that identifier in the file (NgModule `imports`/`exports`/`declarations` arrays, decorator
 * metadata, etc.). Unrecognized specifiers are left untouched on the original import. Returns the
 * transformed source, or the original `file.source` if nothing in `componentMap` was found.
 *
 * `componentMap` values are either a new name string (pure rename/passthrough), or
 * `{ newName, flag: true }` to also call `onFlagged` with the list of flagged names found, for imports
 * that need manual review rather than a safe automatic rewrite.
 */
module.exports = function rewritePackageImports({ j, root, file, oldPackage, newPackage, componentMap, onFlagged }) {
  const matches = root.find(j.ImportDeclaration).filter(p => p.node.source.value === oldPackage);
  if (matches.size() === 0) {
    return file.source;
  }

  const newSpecifierNames = new Set();
  const flaggedNames = new Set();
  const renamePairs = [];
  let changed = false;

  matches.forEach(path => {
    const node = path.node;
    const remainingSpecifiers = [];

    node.specifiers.forEach(specifier => {
      const importedName = specifier.imported?.name ?? specifier.local.name;
      const rawMapping = componentMap[importedName];
      const mapping = typeof rawMapping === 'string' ? { newName: rawMapping } : rawMapping;

      if (!mapping) {
        remainingSpecifiers.push(specifier);
        return;
      }

      changed = true;
      newSpecifierNames.add(mapping.newName);
      if (mapping.flag) {
        flaggedNames.add(importedName);
      }
      if (mapping.newName !== importedName) {
        renamePairs.push({ oldName: importedName, newName: mapping.newName });
      }
    });

    if (remainingSpecifiers.length === 0) {
      j(path).remove();
    } else if (remainingSpecifiers.length !== node.specifiers.length) {
      node.specifiers = remainingSpecifiers;
    }
  });

  renamePairs.forEach(({ oldName, newName }) => {
    root.find(j.Identifier, { name: oldName }).forEach(idPath => {
      idPath.node.name = newName;
    });

    // ast-types doesn't traverse into TS class `decorators` under the `ts`/`tsx` parsers jscodeshift uses
    // here, so `@NgModule({ imports: [...] })` / `@Component({ imports: [...] })` metadata is invisible to
    // the query above and needs an explicit pass over each class's decorator expressions.
    [j.ClassDeclaration, j.ClassExpression].forEach(classType => {
      root.find(classType).forEach(classPath => {
        (classPath.node.decorators || []).forEach(decorator => {
          j(decorator.expression).find(j.Identifier, { name: oldName }).forEach(idPath => {
            idPath.node.name = newName;
          });
        });
      });
    });
  });

  if (newSpecifierNames.size) {
    const importSpecifiers = [...newSpecifierNames].sort().map(name => j.importSpecifier(j.identifier(name)));
    const newImport = j.importDeclaration(importSpecifiers, j.stringLiteral(newPackage));
    root.get().node.program.body.unshift(newImport);
  }

  if (flaggedNames.size && onFlagged) {
    onFlagged([...flaggedNames]);
  }

  return changed ? root.toSource() : file.source;
};
