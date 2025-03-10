const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class MusicViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._view = undefined;
        this._currentSongs = [];
        this._currentSongIndex = 0;
        this._isPlaying = false;
        this._currentSongData = null;
        this._currentSongName = null;
    }

    resolveWebviewView(webviewView, context, token) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getWebviewContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'play':
                    this._isPlaying = true;
                    await this.playMusic();
                    break;
                case 'pause':
                    this._isPlaying = false;
                    await this.pauseMusic();
                    break;
                case 'next':
                    await this.nextSong();
                    break;
                case 'previous':
                    await this.previousSong();
                    break;
                case 'selectFile':
                    await this.selectPlaylist();
                    break;
                case 'songEnded':
                    await this.nextSong();
                    break;
                case 'ready':
                    if (this._currentSongData) {
                        this._view.webview.postMessage({
                            command: 'restoreState',
                            songData: this._currentSongData,
                            songName: this._currentSongName,
                            isPlaying: this._isPlaying,
                            songs: this._currentSongs,
                            currentIndex: this._currentSongIndex
                        });
                    }
                    break;
            }
        });
    }

    async selectPlaylist() {
        const folder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
        });

        if (folder && folder.length > 0) {
            const folderPath = folder[0].fsPath;
            this._currentSongs = fs.readdirSync(folderPath)
                .filter(file => ['.mp3', '.wav', '.ogg'].includes(path.extname(file).toLowerCase()))
                .map(file => ({
                    path: path.join(folderPath, file),
                    name: file
                }));

            this._currentSongIndex = 0;
            if (this._view) {
                this._view.webview.postMessage({ 
                    command: 'updatePlaylist',
                    songs: this._currentSongs,
                    currentIndex: this._currentSongIndex
                });
            }

            if (this._currentSongs.length > 0) {
                this.loadCurrentSong();
            }
        }
    }

    loadCurrentSong() {
        if (this._currentSongs.length > 0) {
            const currentSong = this._currentSongs[this._currentSongIndex];
            const songData = fs.readFileSync(currentSong.path).toString('base64');
            
            this._currentSongData = songData;
            this._currentSongName = currentSong.name;

            if (this._view) {
                this._view.webview.postMessage({
                    command: 'loadSong',
                    songData: songData,
                    songName: currentSong.name,
                    autoplay: this._isPlaying
                });
            }
        }
    }

    async nextSong() {
        if (this._currentSongs.length > 0) {
            this._currentSongIndex = (this._currentSongIndex + 1) % this._currentSongs.length;
            this.loadCurrentSong();
        }
    }

    async previousSong() {
        if (this._currentSongs.length > 0) {
            this._currentSongIndex = (this._currentSongIndex - 1 + this._currentSongs.length) % this._currentSongs.length;
            this.loadCurrentSong();
        }
    }

    async playMusic() {
        this._isPlaying = true;
        if (this._view) {
            this._view.webview.postMessage({ command: 'play' });
        }
    }

    async pauseMusic() {
        this._isPlaying = false;
        if (this._view) {
            this._view.webview.postMessage({ command: 'pause' });
        }
    }

    _getWebviewContent(webview) {
        const webviewPath = vscode.Uri.joinPath(this._extensionUri, 'webview.html');
        const webviewContent = fs.readFileSync(webviewPath.fsPath, 'utf8');
        return webviewContent.replace('${webview.cspSource}', webview.cspSource);
    }
}

function activate(context) {
    const provider = new MusicViewProvider(context.extensionUri);
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('musicView', provider)
    );

    let playMusic = vscode.commands.registerCommand('extension.playMusic', () => {
        provider.playMusic();
    });

    let showMusicPlayer = vscode.commands.registerCommand('extension.showMusicPlayer', () => {
        vscode.commands.executeCommand('musicView.focus');
    });

    context.subscriptions.push(playMusic, showMusicPlayer);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
