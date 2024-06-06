import matchHelper from 'posthtml-match-helper';
import { removeAttr } from '../posthtml-helpers.mjs';

export default function transform(tree) {
  // Remove the `outlined` attribute from forge-card
  tree.match(matchHelper('forge-card[outlined]'), node => {
    removeAttr(node, 'outlined');
    return node;
  });
}
