import { logWarn } from '../../../log.mjs';

const MANUAL_REVIEW_ATTR_PATTERN = /options-?callback|forge-app-launcher-select/i;

export default function transform(tree) {
  tree.match([
    { tag: 'forge-app-launcher-button' },
    { tag: 'forge-app-launcher' }
  ], node => {
    warnIfManualReviewNeeded(node);

    // The standalone `forge-app-launcher-button` trigger no longer exists; `forge-app-launcher` is now
    // self-contained (it renders its own trigger button and popover/dialog).
    if (node.tag === 'forge-app-launcher-button') {
      node.tag = 'forge-app-launcher';
    }

    return node;
  });
}

function warnIfManualReviewNeeded(node) {
  const attrNames = Object.keys(node.attrs ?? {});
  const flagged = attrNames.filter(name => MANUAL_REVIEW_ATTR_PATTERN.test(name));

  if (flagged.length) {
    logWarn(`Found <${node.tag}> with attribute(s) [${flagged.join(', ')}] bound to the legacy \`optionsCallback\`/\`forge-app-launcher-select\` API. This has no automatic equivalent and must be migrated manually to the \`relatedApps\`/\`allApps\` properties and native <a> navigation on each option.`);
  }
}
