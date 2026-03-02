import {
    existsSync,
    mkdirSync,
    copyFileSync,
    readFileSync,
    writeFileSync,
    appendFileSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB } from './db.js';

function log(msg: string): void {
    process.stderr.write(`[setup] ${msg}\n`);
}

function getSubmoduleDir(): string {
    const thisFile = fileURLToPath(import.meta.url);
    return dirname(dirname(thisFile)); // src/ or dist/ → submodule root
}

export function runSetup(projectRoot: string): void {
    const submoduleDir = getSubmoduleDir();
    const submoduleRel = relative(projectRoot, submoduleDir);

    // Step 1: Create Questions/{Awaiting,Resolved,Deferred}/ with .gitkeep
    log('Creating Questions folder structure...');
    for (const dir of ['Questions/Awaiting', 'Questions/Resolved', 'Questions/Deferred']) {
        mkdirSync(join(projectRoot, dir), { recursive: true });
    }
    for (const dir of ['Questions/Resolved', 'Questions/Deferred']) {
        const gitkeep = join(projectRoot, dir, '.gitkeep');
        if (!existsSync(gitkeep)) writeFileSync(gitkeep, '');
    }

    // Step 2: Copy template files (no-clobber)
    log('Copying template files...');
    for (const file of ['agent_question_template.md', 'user_question_template.md', 'questions_guidelines.md']) {
        const dest = join(projectRoot, 'Questions', file);
        if (!existsSync(dest)) {
            copyFileSync(join(submoduleDir, 'templates', file), dest);
        }
    }

    // Step 3: Create/merge .vscode/tasks.json
    log('Configuring VS Code tasks...');
    const vscodePath = join(projectRoot, '.vscode');
    mkdirSync(vscodePath, { recursive: true });
    const tasksFile = join(vscodePath, 'tasks.json');
    const snippet = readFileSync(join(submoduleDir, 'templates', 'tasks.json.snippet'), 'utf-8')
        .replace(/\$\{SUBMODULE_PATH\}/g, submoduleRel);

    if (!existsSync(tasksFile)) {
        writeFileSync(tasksFile, JSON.stringify({
            version: '2.0.0',
            tasks: [JSON.parse(snippet)],
        }, null, 2));
        log('  Created: .vscode/tasks.json');
    } else {
        const existing = readFileSync(tasksFile, 'utf-8');
        if (!existing.includes('Question Review Daemon')) {
            log('  WARNING: .vscode/tasks.json already exists. Add daemon task manually.');
            writeFileSync(join(vscodePath, 'question-review-task.json.snippet'), snippet);
        }
    }

    // Step 4: Create .question-review-logs/ + add to .gitignore
    mkdirSync(join(projectRoot, '.question-review-logs'), { recursive: true });
    const gitignore = join(projectRoot, '.gitignore');
    const gitignoreContent = existsSync(gitignore) ? readFileSync(gitignore, 'utf-8') : '';
    if (!gitignoreContent.includes('.question-review-logs')) {
        appendFileSync(gitignore, '.question-review-logs/\n');
    }

    // Step 5: Install .claude/settings.json from template
    log('Configuring Claude Code permissions...');
    const claudeDir = join(projectRoot, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    copyFileSync(join(submoduleDir, 'templates', 'settings.json'), join(claudeDir, 'settings.json'));

    // Step 6: Initialize DB (schema + seed)
    log('Initializing database...');
    const dbPath = join(projectRoot, 'questions.db');
    const db = new DB(dbPath);
    db.open();
    db.migrate(join(submoduleDir, 'templates', 'schema.sql'));
    db.seed(join(submoduleDir, 'templates', 'seed.sql'));

    // Import from dump if available and DB is fresh
    const dumpPath = join(projectRoot, 'questions.dump.sql');
    if (existsSync(dumpPath)) {
        const count = db.get<{ count: number }>('SELECT COUNT(*) as count FROM questions');
        if (count && count.count === 0) {
            db.close();
            DB.importDump(dumpPath, dbPath);
            log('  Imported questions from dump file');
            return;
        }
    }
    db.close();

    log('Setup complete.');
}
