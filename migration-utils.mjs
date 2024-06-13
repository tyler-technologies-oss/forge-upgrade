
import posthtml from 'posthtml';
import { run as jscodeshift } from 'jscodeshift/src/Runner.js';
import cpath from 'canonical-path';
import { pathToFileURL } from 'url';
import { exec } from 'child_process';
import fs from 'fs';
import crypto from 'crypto';
import ora from 'ora';
import { logBreak, logError, logInfo } from './log.mjs';
import { fileURLToPath } from 'url';
import customPosthtmlRender from './migrations/html/posthtml-render-custom.mjs';

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

      // We find all self-closing tag names in the contents and pass them to posthtml so it doesn't add a closing tag
      const selfClosingTags = contents.match(/<[^>]+\/>/g) ?? [];
      const selfClosingTagNames = selfClosingTags.map(tag => tag.match(/<([^\s>]+)\s|>+/)[1]);
      
      const options = {
        // posthtml options
        render: customPosthtmlRender,

        // render options
        singleTags: selfClosingTagNames,
        closingSingleTag: 'slash'
      };
      const result = await posthtml(plugins).process(contents, options);
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

function computeFileHash(path) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(path);
    rs.on('error', reject);
    rs.on('data', chunk => hash.update(chunk));
    rs.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Executes jscodeshift migrations.
 */
export async function executeJscodeshiftMigrations({ files, migrations, dryRun, verbose, parser }) {
  const spinner = ora(`Executing ${parser === 'tsx' ? 'JSX/TSX' : 'JS/TS'} migrations... ${migrations.map(m => `\n  - ${m.name}`).join('')}`).start();
  const modifiedFiles = new Set();
  const options = {
    dry: dryRun,
    parser,
    verbose: verbose ? 1 : 0,
    silent: !verbose
  };

  try {
    // Compute the hash of each file so we can check if it was modified later
    const fileHashMap = new Map();
    for (const file of files) {
      const hash = await computeFileHash(file);
      fileHashMap.set(file, hash);
    }

    for (const { name, path } of migrations) {
      const { ok, error } = await jscodeshift(cpath.resolve(packageRoot, path), files, options)
      if (ok) {
        // Check if the file was modified
        for (const file of files) {
          const hash = await computeFileHash(file);
          if (fileHashMap.get(file) !== hash) {
            modifiedFiles.add(file);
          }
        }
      } else if (error) {
        spinner.clear();
        spinner.frame();
        logError(`An unexpected error occurred while migrating file: "${file}" using migration: "${name}".`);
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
