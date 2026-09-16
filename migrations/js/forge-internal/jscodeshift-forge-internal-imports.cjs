const OLD_PACKAGE = '@tylertech/forge-internal';

// Maps a named/type import from `@tylertech/forge-internal` to the side-effect import path that
// replaces it on `@tylertech/forge`. `isDefineFn` means the import is a `defineXComponent()` function
// whose call sites should be removed (side-effect imports register the element automatically).
// `flag` means the import came from the retired `forge-app-launcher-button`, which has no 1:1
// equivalent (it collapsed into the now self-contained `forge-app-launcher`) and needs manual review.
const COMPONENT_MAP = {
  FooterComponent: { path: '@tylertech/forge/footer' },
  IFooterComponent: { path: '@tylertech/forge/footer' },
  FooterLayout: { path: '@tylertech/forge/footer' },
  defineFooterComponent: { path: '@tylertech/forge/footer', isDefineFn: true },

  FooterItemComponent: { path: '@tylertech/forge/footer/footer-item' },
  IFooterItemComponent: { path: '@tylertech/forge/footer/footer-item' },
  defineFooterItemComponent: { path: '@tylertech/forge/footer/footer-item', isDefineFn: true },

  AppLauncherComponent: { path: '@tylertech/forge/app-launcher' },
  IAppLauncherComponent: { path: '@tylertech/forge/app-launcher' },
  defineAppLauncherComponent: { path: '@tylertech/forge/app-launcher', isDefineFn: true },

  AppLauncherButtonComponent: { path: '@tylertech/forge/app-launcher', flag: true },
  IAppLauncherButtonComponent: { path: '@tylertech/forge/app-launcher', flag: true },
  defineAppLauncherButtonComponent: { path: '@tylertech/forge/app-launcher', isDefineFn: true, flag: true }
};

// Identifiers with no automatic equivalent at all — their presence anywhere in the file means the
// legacy `optionsCallback` API (async callback, single searchable option list) is in use and must be
// hand-migrated to the new `relatedApps`/`allApps` array properties.
const MANUAL_REVIEW_IDENTIFIERS = ['optionsCallback', 'AppLauncherOptionsCallback', 'IAppLauncherOption', 'IAppLauncherAppIcon'];

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  let changed = false;

  // Independent of the import-rewriting below: `@tylertech/forge-internal` augments the global
  // `HTMLElementTagNameMap`, so a consumer can reference `optionsCallback` (or listen for
  // `forge-app-launcher-select`) on a raw `document.querySelector(...)` result with no import from the
  // package in this file at all. Check for that regardless of whether an import was found.
  if (hasManualReviewIdentifiers(j, root) || hasLegacySelectEventString(j, root)) {
    console.log(`[warning] ${file.path}: found usage of the legacy app-launcher \`optionsCallback\`/\`forge-app-launcher-select\` API. This has no automatic equivalent — migrate manually to the \`relatedApps\`/\`allApps\` properties and native <a> navigation on each option (see the app-launcher migration guide).`);
  }

  const internalImports = root.find(j.ImportDeclaration).filter(p => p.node.source.value === OLD_PACKAGE);
  if (internalImports.size() === 0) {
    return changed ? root.toSource() : file.source;
  }

  const neededPaths = new Set();
  const flaggedNames = new Set();
  const unmappedNames = new Set();
  const importPlans = [];

  internalImports.forEach(path => {
    const node = path.node;

    if (!node.specifiers || node.specifiers.length === 0) {
      console.log(`[warning] ${file.path}: found a side-effect import of '${OLD_PACKAGE}'. This must be split manually into the appropriate '@tylertech/forge/<component>' imports.`);
      return;
    }

    const remainingSpecifiers = [];

    node.specifiers.forEach(specifier => {
      const importedName = specifier.imported?.name ?? specifier.local.name;
      const mapping = COMPONENT_MAP[importedName];

      if (!mapping) {
        remainingSpecifiers.push(specifier);
        unmappedNames.add(importedName);
        return;
      }

      neededPaths.add(mapping.path);
      if (mapping.flag) {
        flaggedNames.add(importedName);
      }
      if (mapping.isDefineFn) {
        removeDefineFunctionCalls(j, root, specifier.local.name);
      }
    });

    importPlans.push({ path, remainingSpecifiers, originalCount: node.specifiers.length });
  });

  if (unmappedNames.size) {
    console.log(`[warning] ${file.path}: left import(s) of [${[...unmappedNames].join(', ')}] from '${OLD_PACKAGE}' untouched — no verified equivalent in the new library.`);
  }

  if (flaggedNames.size) {
    console.log(`[warning] ${file.path}: [${[...flaggedNames].join(', ')}] came from the retired \`forge-app-launcher-button\`, which no longer exists as a separate element — \`forge-app-launcher\` is now self-contained. Review usage manually.`);
  }

  if (neededPaths.size) {
    const anchorPath = internalImports.paths()[0];
    [...neededPaths].sort().forEach(importPath => {
      anchorPath.insertBefore(j.importDeclaration([], j.stringLiteral(importPath)));
    });
    changed = true;
  }

  importPlans.forEach(({ path, remainingSpecifiers, originalCount }) => {
    if (remainingSpecifiers.length === 0) {
      j(path).remove();
      changed = true;
    } else if (remainingSpecifiers.length !== originalCount) {
      path.node.specifiers = remainingSpecifiers;
      changed = true;
    }
  });

  return changed ? root.toSource() : file.source;
}

function removeDefineFunctionCalls(j, root, localName) {
  root.find(j.CallExpression, { callee: { name: localName } }).forEach(callPath => {
    const statementPath = j(callPath).closest(j.ExpressionStatement);
    if (statementPath.size()) {
      statementPath.remove();
    }
  });
}

function hasManualReviewIdentifiers(j, root) {
  return root.find(j.Identifier).filter(p => MANUAL_REVIEW_IDENTIFIERS.includes(p.node.name)).size() > 0;
}

function hasLegacySelectEventString(j, root) {
  return root.find(j.Literal, { value: 'forge-app-launcher-select' }).size() > 0;
}
