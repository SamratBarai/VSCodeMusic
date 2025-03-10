const vscode = require('vscode');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    let panel = vscode.window.createWebviewPanel(
        'musicPlayer',
        'Music Player',
        vscode.ViewColumn.One,
        { enableScripts: true }
    );

    panel.webview.html = getWebviewContent();

    // Listen for messages from the WebView
    panel.webview.onDidReceiveMessage(
        message => {
            if (message.command === 'play') {
                playMusic();
            }
        },
        undefined,
        context.subscriptions
    );

    let disposable = vscode.commands.registerCommand('extension.playMusic', function () {
        playMusic();
    });

    context.subscriptions.push(disposable);
}

function playMusic() {
    const vlcPath = '"C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe"'; // Adjust based on OS
    exec(`${vlcPath} --playlist-autostart`, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`Error starting VLC: ${error.message}`);
            return;
        }
    });
}

function getWebviewContent() {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <script>
                const vscode = acquireVsCodeApi();
                function play() {
                    vscode.postMessage({ command: 'play' });
                }
            </script>
        </head>
        <body>
            <h1>VSCode Music Player</h1>
            <button onclick="play()">Play</button>
        </body>
        </html>
    `;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};