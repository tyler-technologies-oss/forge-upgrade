
import posthtml from 'posthtml';
import { run as jscodeshift } from 'jscodeshift/src/Runner.js';
import cpath from 'canonical-path';
import { pathToFileURL } from 'url';
import { exec } from 'child_process';
import fs from 'fs';
import ora from 'ora';
import { logBreak, logError, logInfo } from './log.mjs';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const packageRoot = cpath.join(cpath.dirname(fs.realpathSync(filename)));

/**
 * Executes HTML migrations.
 */
export async function executeHtmlMigrations({ files, migrations, dryRun }) {
  const spinner = ora(`Executing HTML migrations... ${migrations.map(m => `\n  - ${m.name}`).join('')}`).start();
  const modifiedFiles = new Set();

  try {
    for (const filePath of files) {
      const contents = fs.readFileSync(filePath, 'utf-8');
      const plugins = [];
      
      for (const { path } of migrations) {
        const modulePath = pathToFileURL(cpath.join(packageRoot, path));
        const module = await import(modulePath);
        const plugin = module.default ?? module;
        plugins.push(plugin);
      }

      const result = await posthtml(plugins).process(contents);
      const html = result.html.replace(/=""/g, '');
      
      if (html !== contents) {
        modifiedFiles.add(filePath);

        if (!dryRun) {
          fs.writeFileSync(filePath, html, 'utf-8');
        }
      }
    }

    spinner.succeed();
    logBreak();
  } catch (e) {
    spinner.fail()
    logError(e.stack);
  }

  return modifiedFiles;
}

/**
 * Executes JSX/TSX migrations.
 */
export async function executeJSXMigrations({ files, migrations, dryRun, verbose }) {
  const spinner = ora(`Executing JSX/TSX migrations... ${migrations.map(m => `\n  - ${m.name}`).join('')}`).start();
  const modifiedFiles = new Set();

  try {
    for (const file of files) {
      for (const { name, path } of migrations) {
        const options = {
          dry: dryRun,
          parser: 'tsx',
          verbose: verbose ? 1 : 0,
          silent: !verbose
        };
        const { ok, error } = await jscodeshift(cpath.resolve(packageRoot, path), [file], options)
        if (ok) {
          modifiedFiles.add(file);
        } else if (error) {
          spinner.clear();
          spinner.frame();
          logError(`An unexpected error occurred while migrating file: "${file}" using migration: "${name}".`);
        }
      }
    }
    spinner.succeed();
  } catch (e) {
    spinner.fail()
    logError(e.message);
  }

  return modifiedFiles;
}

/**
 * Executes a terminal command.
 */
export function runCommand(command, cwd = undefined, live = true) {
  return new Promise((resolve, reject) => {
    const maxBuffer = 512000;
    const options = cwd ? { cwd, maxBuffer } : { maxBuffer };
    const process = exec(command, options, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });

    if (live && process.stderr && process.stdout) {
      process.stderr.on('data', data => logError(data));
      process.stdout.on('data', data => logInfo(data));
    }
  });
}
