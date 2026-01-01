// グローバル変数
let settings = {
    storageMode: 'default',
    customPath: '',
    noteFontSize: 15,
    editorFontSize: 16,
    noteLineHeight: 1.6,
    autoSaveEnabled: true,
    confirmDeleteEnabled: true,
    showTimestampEnabled: true
};

let dataFolderPath = null;
let globalNotesCount = 0;
let projectNotesCount = 0;

// 初期化
function init() {
    loadSettings();
    setupEventListeners();
}

// 設定を読み込み
function loadSettings() {
    if (typeof CSInterface === 'undefined') {
        loadSettingsToUI();
        return;
    }

    const csInterface = new CSInterface();
    csInterface.evalScript(`
        (function() {
            var prefsFile = new File(Folder.userData + "/MemoNotesPrefs.json");
            if (prefsFile.exists) {
                prefsFile.open("r");
                var content = prefsFile.read();
                prefsFile.close();
                return content;
            }
            return null;
        })()
    `, function(result) {
        if (result && result !== 'null') {
            try {
                const prefs = JSON.parse(result);
                dataFolderPath = prefs.dataFolderPath;
                
                if (prefs.settings) {
                    settings = Object.assign(settings, prefs.settings);
                }
                
                // メモ数を取得
                if (prefs.noteCounts) {
                    globalNotesCount = prefs.noteCounts.global || 0;
                    projectNotesCount = prefs.noteCounts.project || 0;
                }
                
            } catch (e) {
                console.error('Failed to parse prefs:', e);
            }
        }
        
        loadSettingsToUI();
    });
}

// 設定をUIに反映
function loadSettingsToUI() {
    // ストレージモード
    const storageMode = settings.storageMode || 'default';
    document.querySelector(`input[name="storage-mode"][value="${storageMode}"]`).checked = true;
    
    // カスタムパス表示
    if (settings.customPath) {
        document.getElementById('custom-path-display').textContent = settings.customPath;
    }
    
    // フォントサイズ
    document.getElementById('note-font-size').value = settings.noteFontSize;
    document.getElementById('note-font-size-value').textContent = settings.noteFontSize + 'px';
    
    document.getElementById('editor-font-size').value = settings.editorFontSize;
    document.getElementById('editor-font-size-value').textContent = settings.editorFontSize + 'px';
    
    // 行間
    document.getElementById('note-line-height').value = settings.noteLineHeight;
    document.getElementById('note-line-height-value').textContent = settings.noteLineHeight;
    
    // チェックボックス
    document.getElementById('auto-save-enabled').checked = settings.autoSaveEnabled;
    document.getElementById('confirm-delete-enabled').checked = settings.confirmDeleteEnabled;
    document.getElementById('show-timestamp-enabled').checked = settings.showTimestampEnabled;
    
    // データ情報
    document.getElementById('current-storage-path').textContent = dataFolderPath || '未設定';
    document.getElementById('global-notes-count').textContent = globalNotesCount;
    document.getElementById('project-notes-count').textContent = projectNotesCount;
}

// 設定を保存
function saveSettings() {
    // フォントサイズ
    settings.noteFontSize = parseInt(document.getElementById('note-font-size').value);
    settings.editorFontSize = parseInt(document.getElementById('editor-font-size').value);
    
    // 行間
    settings.noteLineHeight = parseFloat(document.getElementById('note-line-height').value);
    
    // チェックボックス
    settings.autoSaveEnabled = document.getElementById('auto-save-enabled').checked;
    settings.confirmDeleteEnabled = document.getElementById('confirm-delete-enabled').checked;
    settings.showTimestampEnabled = document.getElementById('show-timestamp-enabled').checked;
    
    // ストレージモード
    const selectedMode = document.querySelector('input[name="storage-mode"]:checked').value;
    settings.storageMode = selectedMode;
    
    // 設定ファイルを保存
    if (typeof CSInterface !== 'undefined') {
        const csInterface = new CSInterface();
        csInterface.evalScript(`
            (function() {
                var prefsFile = new File(Folder.userData + "/MemoNotesPrefs.json");
                if (prefsFile.exists) {
                    prefsFile.open("r");
                    var content = prefsFile.read();
                    prefsFile.close();
                    return content;
                }
                return null;
            })()
        `, function(result) {
            let prefs = {};
            if (result && result !== 'null') {
                try {
                    prefs = JSON.parse(result);
                } catch(e) {}
            }
            
            prefs.settings = settings;
            savePrefsFile(prefs);
        });
    }
    
    // ウィンドウを閉じる
    closeWindow();
}

// 設定ファイルを保存
function savePrefsFile(prefs) {
    if (typeof CSInterface === 'undefined') return;

    const csInterface = new CSInterface();
    const jsonStr = JSON.stringify(prefs).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    
    csInterface.evalScript(`
        (function() {
            try {
                var prefsFile = new File(Folder.userData + "/MemoNotesPrefs.json");
                prefsFile.encoding = "UTF-8";
                prefsFile.open("w");
                prefsFile.write("${jsonStr}");
                prefsFile.close();
                return "success";
            } catch(e) {
                return "error: " + e.toString();
            }
        })()
    `, function(result) {
        console.log('Settings save result:', result);
    });
}

// 保存先フォルダを変更
function changeStoragePath() {
    if (typeof CSInterface === 'undefined') {
        alert('CSInterfaceが利用できません');
        return;
    }

    // Node.jsを使ってフォルダ選択
    try {
        const exec = window.cep_node.require('child_process').exec;
        const fs = window.cep_node.require('fs');
        const path = window.cep_node.require('path');
        const os = window.cep_node.require('os');
        
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Reflection.Assembly]::LoadWithPartialName("System.windows.forms") | Out-Null

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.ValidateNames = $false
$dialog.CheckFileExists = $false
$dialog.CheckPathExists = $true
$dialog.FileName = "フォルダを選択"
$dialog.Title = "メモの保存先フォルダを選択してください"
$dialog.Filter = "フォルダ|*.folder"

if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Split-Path $dialog.FileName
}
        `.trim();
        
        const tempDir = os.tmpdir();
        const psFilePath = path.join(tempDir, 'select_folder_settings.ps1');
        
        fs.writeFileSync(psFilePath, psScript, 'utf8');
        
        const command = `powershell.exe -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "${psFilePath}"`;
        
        exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            try {
                fs.unlinkSync(psFilePath);
            } catch(e) {}
            
            if (error) {
                alert('フォルダの選択に失敗しました');
                return;
            }
            
            const result = stdout.trim();
            
            if (result && result.length > 0 && result !== 'null') {
                settings.customPath = result;
                document.getElementById('custom-path-display').textContent = result;
                document.querySelector('input[name="storage-mode"][value="custom"]').checked = true;
                
                // データフォルダパスを更新
                dataFolderPath = result;
                
                // 設定を保存
                if (typeof CSInterface !== 'undefined') {
                    const csInterface = new CSInterface();
                    csInterface.evalScript(`
                        (function() {
                            var prefsFile = new File(Folder.userData + "/MemoNotesPrefs.json");
                            if (prefsFile.exists) {
                                prefsFile.open("r");
                                var content = prefsFile.read();
                                prefsFile.close();
                                return content;
                            }
                            return null;
                        })()
                    `, function(prefResult) {
                        let prefs = {};
                        if (prefResult && prefResult !== 'null') {
                            try {
                                prefs = JSON.parse(prefResult);
                            } catch(e) {}
                        }
                        
                        prefs.mode = 'custom';
                        prefs.dataFolderPath = result;
                        prefs.settings = settings;
                        savePrefsFile(prefs);
                        
                        document.getElementById('current-storage-path').textContent = result;
                    });
                }
                
                alert('保存先フォルダを変更しました。変更を反映するには拡張機能を再起動してください。');
            }
        });
        
    } catch(nodeError) {
        // フォールバック
        const csInterface = new CSInterface();
        csInterface.evalScript(`
            (function() {
                try {
                    var folder = Folder.selectDialog("メモの保存先フォルダを選択してください");
                    if (folder) {
                        return folder.fsName;
                    }
                    return null;
                } catch(e) {
                    return "error: " + e.toString();
                }
            })()
        `, function(result) {
            if (result && result !== 'null' && result !== 'undefined' && !result.startsWith('error:')) {
                settings.customPath = result;
                document.getElementById('custom-path-display').textContent = result;
                document.querySelector('input[name="storage-mode"][value="custom"]').checked = true;
                
                dataFolderPath = result;
                document.getElementById('current-storage-path').textContent = result;
                
                alert('保存先フォルダを変更しました。変更を反映するには拡張機能を再起動してください。');
            }
        });
    }
}

// データフォルダを開く
function openDataFolder() {
    if (!dataFolderPath || typeof CSInterface === 'undefined') {
        alert('データフォルダが設定されていません');
        return;
    }
    
    const csInterface = new CSInterface();
    const safePath = dataFolderPath.replace(/\\/g, '/');
    
    csInterface.evalScript(`
        (function() {
            try {
                var folder = new Folder("${safePath}");
                if (folder.exists) {
                    folder.execute();
                    return "success";
                }
                return "folder not found";
            } catch(e) {
                return "error: " + e.toString();
            }
        })()
    `, function(result) {
        if (result !== 'success') {
            alert('フォルダを開けませんでした');
        }
    });
}

// ウィンドウを閉じる
function closeWindow() {
    if (typeof CSInterface !== 'undefined') {
        const csInterface = new CSInterface();
        csInterface.closeExtension();
    } else {
        window.close();
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // 保存ボタン
    document.getElementById('save-btn').addEventListener('click', saveSettings);
    
    // キャンセルボタン
    document.getElementById('cancel-btn').addEventListener('click', closeWindow);
    
    // スライダー
    document.getElementById('note-font-size').addEventListener('input', (e) => {
        document.getElementById('note-font-size-value').textContent = e.target.value + 'px';
    });
    
    document.getElementById('editor-font-size').addEventListener('input', (e) => {
        document.getElementById('editor-font-size-value').textContent = e.target.value + 'px';
    });
    
    document.getElementById('note-line-height').addEventListener('input', (e) => {
        document.getElementById('note-line-height-value').textContent = e.target.value;
    });
    
    // 保存先変更
    document.getElementById('change-path-btn').addEventListener('click', changeStoragePath);
    
    // データフォルダを開く
    document.getElementById('open-folder-btn').addEventListener('click', openDataFolder);
    
    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeWindow();
        } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveSettings();
        }
    });
}

// 起動時の初期化
init();