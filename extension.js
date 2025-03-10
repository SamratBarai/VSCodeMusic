const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');

class MusicViewProvider {
    constructor(extensionUri) {
        this._extensionUri = extensionUri;
        this._view = undefined;
        this._currentSongs = [];
        this._currentSongIndex = 0;
        this._isPlaying = false;
        this._currentSongData = null;
        this._currentSongName = null;
        this._audioElement = null;
        this.initializeAudio();
    }

    initializeAudio() {
        // We'll use the node-audio-player package or similar here
        // For now, this is a placeholder for the audio implementation
        // TODO: Implement native audio playback
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
                    await this.playMusic();
                    break;
                case 'pause':
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
                    this.updateWebviewState();
                    break;
            }
        });
    }

    updateWebviewState() {
        if (this._view && this._currentSongData) {
            this._view.webview.postMessage({
                command: 'restoreState',
                songData: this._currentSongData,
                songName: this._currentSongName,
                isPlaying: this._isPlaying,
                songs: this._currentSongs,
                currentIndex: this._currentSongIndex
            });
        }
    }

    async selectPlaylist() {
        const defaultMusicPath = "G:\\Samrat\\Music\\favourite";
        
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: true,
            canSelectMany: true,
            defaultUri: vscode.Uri.file(defaultMusicPath),
            filters: {
                'XSPF Playlists': ['xspf'],
                'All files': ['*']
            },
            title: 'Select a playlist file or music folder'
        });

        if (!result || result.length === 0) {
            return;
        }

        const selectedPath = result[0].fsPath;
        const stats = fs.statSync(selectedPath);

        if (stats.isDirectory()) {
            await this.loadFromDirectory(selectedPath);
        } else if (path.extname(selectedPath).toLowerCase() === '.xspf') {
            await this.loadFromXSPF(selectedPath);
        } else {
            vscode.window.showErrorMessage('Please select a valid playlist file (.xspf) or folder');
        }
    }

    async loadFromDirectory(folderPath) {
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

    async loadFromXSPF(filePath) {
        try {
            const xmlContent = fs.readFileSync(filePath, 'utf8');
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlContent);

            if (!result.playlist || !result.playlist.trackList || !result.playlist.trackList[0].track) {
                vscode.window.showErrorMessage('Invalid XSPF playlist format');
                return;
            }

            const tracks = result.playlist.trackList[0].track;
            this._currentSongs = tracks
                .filter(track => track.location && track.location[0])
                .map(track => {
                    const location = track.location[0];
                    // Handle both local files and URLs
                    const isUrl = location.startsWith('http://') || location.startsWith('https://');
                    return {
                        path: isUrl ? location : this.resolveLocalPath(location, filePath),
                        name: track.title ? track.title[0] : path.basename(location)
                    };
                })
                .filter(song => {
                    // For local files, verify they exist
                    if (!song.path.startsWith('http://') && !song.path.startsWith('https://')) {
                        return fs.existsSync(song.path);
                    }
                    return true;
                });

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
        } catch (error) {
            vscode.window.showErrorMessage(`Error loading XSPF playlist: ${error.message}`);
        }
    }

    resolveLocalPath(location, playlistPath) {
        if (path.isAbsolute(location)) {
            return location;
        }
        return path.resolve(path.dirname(playlistPath), location);
    }

    loadCurrentSong() {
        if (this._currentSongs.length > 0) {
            const currentSong = this._currentSongs[this._currentSongIndex];
            const songData = fs.readFileSync(currentSong.path).toString('base64');
            
            this._currentSongData = songData;
            this._currentSongName = currentSong.name;

            // Play the audio using native audio implementation
            // TODO: Implement native audio playback

            // Update webview if visible
            this.updateWebviewState();
        }
    }

    async nextSong() {
        if (this._currentSongs.length > 0) {
            this._currentSongIndex = (this._currentSongIndex + 1) % this._currentSongs.length;
            // Update song list before loading new song
            if (this._view) {
                this._view.webview.postMessage({ 
                    command: 'updatePlaylist',
                    songs: this._currentSongs,
                    currentIndex: this._currentSongIndex
                });
            }
            this.loadCurrentSong();
        }
    }

    async previousSong() {
        if (this._currentSongs.length > 0) {
            this._currentSongIndex = (this._currentSongIndex - 1 + this._currentSongs.length) % this._currentSongs.length;
            // Update song list before loading new song
            if (this._view) {
                this._view.webview.postMessage({ 
                    command: 'updatePlaylist',
                    songs: this._currentSongs,
                    currentIndex: this._currentSongIndex
                });
            }
            this.loadCurrentSong();
        }
    }

    async playMusic() {
        this._isPlaying = true;
        // TODO: Implement native audio playback play
        if (this._view) {
            this._view.webview.postMessage({ command: 'play' });
        }
    }

    async pauseMusic() {
        this._isPlaying = false;
        // TODO: Implement native audio playback pause
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

    let playMusic = vscode.commands.registerCommand('extension.playMusic', () => {
        provider.playMusic();
    });

    let pauseMusic = vscode.commands.registerCommand('extension.pauseMusic', () => {
        provider.pauseMusic();
    });

    let showMusicPlayer = vscode.commands.registerCommand('extension.showMusicPlayer', () => {
        vscode.commands.executeCommand('musicView.focus');
    });
    
    context.subscriptions.push(playMusic, pauseMusic, showMusicPlayer);

    // Create status bar item
    const playMusicItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    playMusicItem.text = "Play";
    playMusicItem.tooltip = "Click to play music";
    playMusicItem.command = 'extension.playMusic';
    playMusicItem.show();

    const pauseMusicItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    pauseMusicItem.text = "Pause";
    pauseMusicItem.tooltip = "Click to pause music";
    pauseMusicItem.command = 'extension.pauseMusic';
    pauseMusicItem.show();

    const showMusicItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    showMusicItem.text = "Open music";
    showMusicItem.tooltip = "Click to Show sidebar";
    showMusicItem.command = 'extension.showMusicPlayer';
    showMusicItem.show();
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('musicView', provider),
        playMusicItem, 
        pauseMusicItem, 
        showMusicItem
    );
    
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
