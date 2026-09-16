const rewritePackageImports = require('./package-import-rewrite.cjs');

const OLD_PACKAGE = '@tylertech/forge-extended-angular';
const NEW_PACKAGE = '@tylertech/forge-angular';

// Verified 1:1: every NgModule/component exported by `@tylertech/forge-extended-angular` for
// footer/app-launcher has an identically-behaving export in `@tylertech/forge-angular` — only the
// "Extended" NgModule class name prefix is dropped. Component class names are unchanged. This covers teams
// that already moved from `forge-internal` to `forge-extended`'s Angular wrapper and now need the second
// hop onto core `@tylertech/forge-angular`.
const COMPONENT_MAP = {
  ForgeExtendedFooterModule: 'ForgeFooterModule',
  FooterComponent: 'FooterComponent',
  ForgeExtendedFooterItemModule: 'ForgeFooterItemModule',
  FooterItemComponent: 'FooterItemComponent',
  ForgeExtendedAppLauncherModule: 'ForgeAppLauncherModule',
  AppLauncherComponent: 'AppLauncherComponent',
  ForgeExtendedAppLauncherLinkModule: 'ForgeAppLauncherLinkModule',
  AppLauncherLinkComponent: 'AppLauncherLinkComponent'
};

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  return rewritePackageImports({
    j,
    root,
    file,
    oldPackage: OLD_PACKAGE,
    newPackage: NEW_PACKAGE,
    componentMap: COMPONENT_MAP
  });
}
