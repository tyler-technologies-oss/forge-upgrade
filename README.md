# Forge Upgrade

This utility can be used to aid in the upgrade process for Forge-based projects.

It will run a find/replace and code migrations on all files within the provided `--path`, and attempt to perform any automated replacements that it can for known upgrade migrations.

> Manual evaluation should **always** be done after running this utility.

## Usage

Run the utility using `npx`:

```bash
npx @tylertech/forge-upgrade
```

> **Important:** You must be on NodeJS version 16 or later.

## Configurations

Upgrades are run from a "configuration" file within this utility. The table below will help you decide which configuration to
use based on the version of TCW/Forge that your project is currently using prior to the upgrade:

| From      | To                        | Configuration
| ----------| ------------------------- | -------------
| Forge 2.x | Forge 3.0                 | `forge-3.0` **(latest)**
| Forge 2.x | Forge 3.0 (deprecations)  | `forge-3.0-deprecated`
| TCW 1.x   | Forge 2.0                 | `forge-2.0`
| TCW 1.x   | Forge 3.0                 | First run with `forge-2.0` then run again with `forge-3.0`

> Additional manual upgrades may be required, see version announcement and/or release notes for further information.

### Options

The utility will accept the following arguments:

| Option                   | Description    
| -------------------------| ---------------
| `--path <path>`          | Accepts a relative path from the current directory to the source directory where the upgrade should begin from.
| `--configuration <name>` | The name of the upgrade configuration to use. Defaults to most recent configuration.
| `--no-replace`           | Disables replace operations.
| `--no-migrate`           | Disables code migrations.
| `--dry-run`              | Runs the utility without modifying any files and prints out what it would do if ran without this flag.
| `--ignore`               | Paths or globs of files to ignore. (ex. `--ignore "**/*/my-directory/**/*"`). Note: separate multiple values with a comma.
| `--verbose`              | Enables verbose logging.
| `--help`                 | Prints the help usage.
