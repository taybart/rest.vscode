import * as vscode from 'vscode';
import { exec } from 'child_process';

type HclRequest = {
  label: string;
  line: number; // zero-based
};

function parseHclRequests(document: vscode.TextDocument): HclRequest[] {
  const requests: HclRequest[] = [];
  // Simple heuristic: match lines like: request "label" {  OR  request label {
  // Allows optional whitespace; label can be quoted or unquoted (identifier-like)
  const pattern = /^\s*request\s+(?:"([^"]+)"|([A-Za-z0-9_\-\.]+))\s*\{/;
  for (let i = 0; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    const match = lineText.match(pattern);
    if (match) {
      const label = match[1] ?? match[2] ?? `line-${i + 1}`;
      requests.push({ label, line: i });
    }
  }
  return requests;
}

class RequestCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this.onDidChangeCodeLensesEmitter.event;

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const requests = parseHclRequests(document);
    for (const req of requests) {
      const range = new vscode.Range(
        new vscode.Position(req.line, 0),
        new vscode.Position(req.line, Math.max(0, document.lineAt(req.line).text.length))
      );
      const cmd: vscode.Command = {
        command: 'restRunner.runRequest',
        title: `▶ Run ${req.label}`,
        tooltip: `Run request ${req.label}`,
        arguments: [document.uri, req.label]
      };
      lenses.push(new vscode.CodeLens(range, cmd));
    }
    return lenses;
  }
}

async function runRest(uri: vscode.Uri, label: string): Promise<void> {
  const filePath = uri.fsPath;
  const cmd = `rest -f "${filePath}" -l "${label}"`;
  const output = vscode.window.createOutputChannel('rest output');
  output.show(true);
  output.appendLine(`$ ${cmd}`);
  await new Promise<void>((resolve) => {
    exec(
      cmd,
      { shell: process.env.SHELL || '/bin/sh', encoding: 'utf8' },
      (error: import('child_process').ExecException | null, stdout: string, stderr: string) => {
        if (stdout) output.appendLine(stdout);
        if (stderr) output.appendLine(stderr);
        if (error) {
          output.appendLine(`Exit with error: ${error.message}`);
        } else {
          output.appendLine('Completed successfully.');
        }
        resolve();
      }
    );
  });
}

export function activate(context: vscode.ExtensionContext) {
  const selector: vscode.DocumentSelector = [
    { language: 'rest', scheme: 'file' },
    { pattern: '**/*.{rest}' }
  ];

  const provider = new RequestCodeLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, provider)
  );

  const disposable = vscode.commands.registerCommand('restRunner.runRequest', runRest);
  context.subscriptions.push(disposable);
}

export function deactivate() { }


