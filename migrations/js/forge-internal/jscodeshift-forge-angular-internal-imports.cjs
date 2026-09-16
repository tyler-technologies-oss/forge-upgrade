const rewritePackageImports = require('./package-import-rewrite.cjs');

const OLD_PACKAGE = '@tylertech/forge-angular-internal';
const NEW_PACKAGE = '@tylertech/forge-angular';

// Every NgModule/component exported by `@tylertech/forge-angular-internal` for footer/app-launcher has an
// identically named export in `@tylertech/forge-angular` — except `forge-app-launcher-button`, which no
// longer exists as a separate element (`forge-app-launcher` is now self-contained). Its Angular wrapper
// module/component collapse into the app-launcher's, flagged for manual review. Anything else exported by
// this package (e.g. the landing-page-layout wrapper) is left untouched — no verified equivalent.
const COMPONENT_MAP = {
  ForgeFooterModule: 'ForgeFooterModule',
  FooterComponent: 'FooterComponent',
  ForgeFooterItemModule: 'ForgeFooterItemModule',
  FooterItemComponent: 'FooterItemComponent',
  ForgeAppLauncherModule: 'ForgeAppLauncherModule',
  AppLauncherComponent: 'AppLauncherComponent',
  ForgeAppLauncherButtonModule: { newName: 'ForgeAppLauncherModule', flag: true },
  AppLauncherButtonComponent: { newName: 'AppLauncherComponent', flag: true }
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
    componentMap: COMPONENT_MAP,
    onFlagged: names => console.log(`[warning] ${file.path}: [${names.join(', ')}] came from the retired \`forge-app-launcher-button\` Angular wrapper, which no longer exists — \`ForgeAppLauncherModule\`/\`AppLauncherComponent\` are now self-contained. Review \`optionsCallback\`/select-event usage manually.`)
  });
}
