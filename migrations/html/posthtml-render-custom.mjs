const VOID_TAGS = ['area', 'base', 'br', 'col', 'command', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];
const ATTRIBUTE_QUOTES_REQUIRED_REGEX = /[\t\n\f\r " '`=<>]/;

/** 
 * Render PostHTML Tree to HTML
 * @param  {Array|Object} tree PostHTML Tree @param  {Object} options Options
 * @return {String} HTML
 */
function render (tree, options) {
  /**
   * Options
   * @type {Object}
   *
   * @prop {Array<String|RegExp>} singleTags  Custom single tags (selfClosing)
   * @prop {String} closingSingleTag Closing format for single tag @prop
   * @prop {Boolean} quoteAllAttributes If all attributes should be quoted. Otherwise attributes will be unquoted when allowed.
   *
   * Formats:
   * ``` tag: `<br></br>` ```, slash: `<br />` ```, ```default: `<br>` ```
   */
  options = options ?? {};

  const singleTags = options.singleTags ? VOID_TAGS.concat(options.singleTags) : VOID_TAGS;
  const singleRegExp = singleTags.filter(tag =>tag instanceof RegExp);

  const closingSingleTag = options.closingSingleTag;
  let quoteAllAttributes = options.quoteAllAttributes;
  if (typeof quoteAllAttributes === 'undefined') {
    quoteAllAttributes = true;
  }

  /** @private */
  function isSingleTag(tag) {
    if (singleRegExp.length) {
      for (let i = 0; i < singleRegExp.length; i++) {
        return singleRegExp[i].test(tag)
      }
    }
    return singleTags.indexOf(tag) !== -1;
  }

  /** @private */
  function attrs(obj) {
    let attr = ''

    for (var key in obj) {
      if (typeof obj[key] === 'string') {
        if (quoteAllAttributes || obj[key].match(ATTRIBUTE_QUOTES_REQUIRED_REGEX)) {
          attr += ' ' + key + '="' + obj[key].replace(/"/g, '&quot;') + '"'
        } else if (obj[key] === '') {
          attr += ' ' + key
        } else {
          attr += ' ' + key + '=' + obj[key]
        }
      } else if (obj[key] === true) {
        attr += ' ' + key
      } else if (typeof obj[key] === 'number') {
        attr += ' ' + key + '="' + obj[key] + '"'
      }
    }

    return attr
  }

  /** @private */
  function traverse(tree, cb) {
    if (tree !== undefined) {
      for (let i = 0, length = tree.length; i < length; i++) {
        traverse(cb(tree[i]), cb)
      }
    }
  }

  /**
   * HTML Stringifier
   * @param  {Array|Object} tree PostHTML Tree
   * @return {String} result HTML
   */
  function html (tree) {
    let result = '';

    if (!Array.isArray(tree)) {
      tree = [tree];
    }

    traverse(tree, function (node) {
      if (node === undefined ||
          node === null ||
          node === false ||
          node.length === 0 ||
          Number.isNaN(node)) {
        return;
      }

      // treat as new root tree if node is an array
      if (Array.isArray(node)) {
        result += html(node);
        return;
      }

      if (typeof node === 'string' || typeof node === 'number') {
        result += node;
        return;
      }

      // skip node
      if (node.tag === false) {
        result += html(node.content);
        return;
      }

      const tag = node.tag || 'div';

      result += '<' + tag;

      if (node.attrs) {
        result += attrs(node.attrs);
      }

      if (isSingleTag(tag)) {
        if (VOID_TAGS.includes(tag)) {
          result += '>';
        } else {
          switch (closingSingleTag) {
            case 'tag':
              result += '></' + tag + '>';
              break;
            case 'slash':
              result += ' />';
              break;
            default:
              result += '>';
          }
        }

        result += html(node.content);
      } else {
        result += '>' + html(node.content) + '</' + tag + '>';
      }
    });

    return result;
  }

  return html(tree);
}

/**
 * @module posthtml-render
 */
export default render;
