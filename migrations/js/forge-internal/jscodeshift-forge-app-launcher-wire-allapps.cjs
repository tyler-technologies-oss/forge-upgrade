const fs = require('fs');
const path = require('path');

// Only handles the unambiguous case: an Angular `@Component({ templateUrl })` whose template binds
// `[optionsCallback]` on `forge-app-launcher`/`forge-app-launcher-button` to a bare method/property name
// that exists on the class. Anything else (inline templates, complex binding expressions, no matching
// class member) is left alone with a warning — this never guesses.
//
// `relatedApps` is intentionally never touched: it's a new, manually-curated feature with no equivalent in
// the old app launcher, so there's nothing to wire it from.
const BINDING_TAG_RE = /<forge-app-launcher(?:-button)?\b[^>]*>/i;
const BINDING_ATTR_RE = /\[optionsCallback\]\s*=\s*"([^"]+)"/i;
const SIMPLE_IDENTIFIER_RE = /^[a-zA-Z_$][\w$]*$/;

module.exports = function transformer(file, api, options) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const dryRun = !!options?.dry;

  let changed = false;

  root.find(j.ClassDeclaration).forEach(classPath => {
    const componentDecorator = (classPath.node.decorators || []).find(isComponentDecorator);
    if (!componentDecorator) {
      return;
    }

    const templateUrlValue = getTemplateUrlLiteral(componentDecorator);
    if (!templateUrlValue) {
      // No `templateUrl` (likely an inline `template: \`...\`` string) — out of scope, consistent with the
      // rest of this tool never rewriting inline templates.
      return;
    }

    const templatePath = path.resolve(path.dirname(file.path), templateUrlValue);
    if (!fs.existsSync(templatePath)) {
      return;
    }

    const templateSource = fs.readFileSync(templatePath, 'utf-8');
    const binding = findOptionsCallbackBinding(templateSource);
    if (!binding) {
      return;
    }

    const methodName = binding.expression.trim().replace(/^this\./, '');
    if (!SIMPLE_IDENTIFIER_RE.test(methodName)) {
      console.log(`[warning] ${file.path}: [optionsCallback] in ${templatePath} is bound to a non-simple expression ("${binding.expression}") — could not auto-wire to \`allApps\`. Migrate manually.`);
      return;
    }

    const classBody = classPath.node.body.body;
    if (!classBody.some(member => member.key?.name === methodName)) {
      console.log(`[warning] ${file.path}: [optionsCallback] in ${templatePath} references "${methodName}", but no matching method/property was found on this class — could not auto-wire to \`allApps\`.`);
      return;
    }

    if (classBody.some(member => member.key?.name === 'allApps')) {
      console.log(`[warning] ${file.path}: class already has an \`allApps\` member — skipped auto-wiring to avoid a collision. Review manually.`);
      return;
    }

    addAllAppsField(j, classPath);
    addOrAugmentNgOnInit(j, classPath, methodName);
    ensureAppLauncherOptionImport(j, root);

    const newTemplateSource = templateSource.replace(
      binding.fullMatch,
      binding.fullMatch.replace(BINDING_ATTR_RE, '[allApps]="allApps"')
    );
    if (!dryRun) {
      fs.writeFileSync(templatePath, newTemplateSource, 'utf-8');
    }

    console.log(`[info] ${file.path}: auto-wired \`optionsCallback\` ("${methodName}") to \`allApps\` — added an \`allApps\` field and an \`ngOnInit\` call, and updated the binding in ${templatePath}. VERIFY: the mapped shape (label/uri/iconName) matches your actual data, and that silently falling back to an empty list on fetch failure is acceptable (the new app-launcher has no built-in error view). \`relatedApps\` and any \`(forge-app-launcher-select)\` binding were left untouched — review those separately.`);
    changed = true;
  });

  return changed ? root.toSource() : file.source;
};

function isComponentDecorator(decorator) {
  return decorator.expression?.type === 'CallExpression' && decorator.expression.callee?.name === 'Component';
}

function getTemplateUrlLiteral(decorator) {
  const arg = decorator.expression.arguments?.[0];
  if (!arg || arg.type !== 'ObjectExpression') {
    return null;
  }
  const prop = arg.properties.find(p => (p.key?.name ?? p.key?.value) === 'templateUrl');
  return typeof prop?.value?.value === 'string' ? prop.value.value : null;
}

function findOptionsCallbackBinding(templateSource) {
  const tagMatch = templateSource.match(BINDING_TAG_RE);
  if (!tagMatch) {
    return null;
  }
  const attrMatch = tagMatch[0].match(BINDING_ATTR_RE);
  if (!attrMatch) {
    return null;
  }
  return { fullMatch: tagMatch[0], expression: attrMatch[1] };
}

function parseClassMembers(j, memberSource) {
  const wrapped = j(`class __Wrapper__ { ${memberSource} }`);
  return wrapped.find(j.ClassBody).nodes()[0].body;
}

function addAllAppsField(j, classPath) {
  const [field] = parseClassMembers(j, 'allApps: AppLauncherOption[] = [];');
  classPath.node.body.body.unshift(field);
}

function ensureAppLauncherOptionImport(j, root) {
  const alreadyImported = root.find(j.ImportSpecifier, { imported: { name: 'AppLauncherOption' } }).size() > 0;
  if (alreadyImported) {
    return;
  }

  const existingAppLauncherImport = root.find(j.ImportDeclaration)
    .filter(p => p.node.source.value === '@tylertech/forge/app-launcher')
    .paths()[0];

  if (existingAppLauncherImport) {
    existingAppLauncherImport.node.specifiers.push(j.importSpecifier(j.identifier('AppLauncherOption')));
    return;
  }

  root.get().node.program.body.unshift(j.importDeclaration(
    [j.importSpecifier(j.identifier('AppLauncherOption'))],
    j.stringLiteral('@tylertech/forge/app-launcher')
  ));
}

function addOrAugmentNgOnInit(j, classPath, methodName) {
  const wiringSnippet = `
    this.${methodName}().then(result => {
      this.allApps = (result.options || []).map(o => ({ label: o.label, uri: o.uri, iconName: o.icon?.name }));
    }).catch(err => {
      console.error(err);
      this.allApps = [];
    });
  `;
  const [newMethod] = parseClassMembers(j, `ngOnInit() {${wiringSnippet}}`);

  const existing = classPath.node.body.body.find(member => member.key?.name === 'ngOnInit');
  if (existing) {
    existing.body.body.push(...newMethod.body.body);
  } else {
    classPath.node.body.body.push(newMethod);
  }
}
