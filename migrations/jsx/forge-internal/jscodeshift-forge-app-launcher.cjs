const helpers = require('../jscodeshift-helpers.cjs');

// The standalone `<forge-app-launcher-button>` / `<ForgeAppLauncherButton>` trigger no longer exists;
// `forge-app-launcher` is now self-contained (it renders its own trigger button and popover/dialog).
const RENAME_PAIRS = [
  ['ForgeAppLauncherButton', 'ForgeAppLauncher'],
  ['forge-app-launcher-button', 'forge-app-launcher']
];

// Elements already on the new tag name are still checked for the manual-review props below, in case
// only the tag was renamed previously but the legacy API usage remains.
const NEW_NAMES = RENAME_PAIRS.map(([, newName]) => newName);

const MANUAL_REVIEW_PROPS = ['optionsCallback', 'onForgeAppLauncherSelect'];

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Collect every matching node up front, before any renaming happens — otherwise a renamed node would
  // be picked up again by a later query for the new name, producing a duplicate warning.
  const toRename = RENAME_PAIRS.flatMap(([oldName, newName]) =>
    root.findJSXElements(oldName).nodes().map(node => ({ node, newName }))
  );
  const alreadyOnNewName = NEW_NAMES.flatMap(name => root.findJSXElements(name).nodes());

  toRename.forEach(({ node, newName }) => {
    warnIfManualReviewNeeded(file, node, node.openingElement.name.name);
    renameElement(node, newName);
  });

  alreadyOnNewName.forEach(node => {
    warnIfManualReviewNeeded(file, node, node.openingElement.name.name);
  });

  return root.toSource();
}

function renameElement(node, newName) {
  node.openingElement.name.name = newName;
  if (node.closingElement) {
    node.closingElement.name.name = newName;
  }
}

function warnIfManualReviewNeeded(file, node, tagName) {
  const flagged = MANUAL_REVIEW_PROPS.filter(name => helpers.hasAttribute(node, name));

  if (flagged.length) {
    console.log(`[warning] ${file.path}: <${tagName}> uses [${flagged.join(', ')}] — the legacy \`optionsCallback\`/select-event API has no automatic equivalent. Migrate manually to the \`relatedApps\`/\`allApps\` properties and native <a> navigation on each option.`);
  }
}
