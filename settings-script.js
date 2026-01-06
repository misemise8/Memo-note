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

// 冒頭に追加
function escapeForExtendScript(str) {
    return str
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'");
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
            var prefsFile = new File(Folder.myDocuments + "/MemoNotes/settings.json");
            if (prefsFile.exists) {
                prefsFile.encoding = "UTF-8";
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
                // 【修正】ここでもバックスラッシュを置換
                const sanitizedResult = result.replace(/\\/g, "/");
                const prefs = JSON.parse(sanitizedResult);
                
                // パスを正規化して読み込み
                dataFolderPath = prefs.dataFolderPath ? prefs.dataFolderPath.replace(/\\/g, "/") : '';
                
                if (prefs.settings) {
                    settings = Object.assign(settings, prefs.settings);
                }
                
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
    const modeRadio = document.querySelector(`input[name="storage-mode"][value="${storageMode}"]`);
    if (modeRadio) modeRadio.checked = true;
    
    // カスタムパス表示
    if (dataFolderPath) {
        document.getElementById('custom-path-display').textContent = dataFolderPath;
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
    // UIから設定値を取得
    settings.noteFontSize = parseInt(document.getElementById('note-font-size').value);
    settings.editorFontSize = parseInt(document.getElementById('editor-font-size').value);
    settings.noteLineHeight = parseFloat(document.getElementById('note-line-height').value);
    settings.autoSaveEnabled = document.getElementById('auto-save-enabled').checked;
    settings.confirmDeleteEnabled = document.getElementById('confirm-delete-enabled').checked;
    settings.showTimestampEnabled = document.getElementById('show-timestamp-enabled').checked;
    
    const selectedMode = document.querySelector('input[name="storage-mode"]:checked').value;
    settings.storageMode = selectedMode;
    
    if (typeof CSInterface !== 'undefined') {
        const csInterface = new CSInterface();
        const extensionPath = csInterface.getSystemPath('extension');
        
        // 既存の設定ファイルを読み込む
        csInterface.evalScript(`
            $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
            readJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json");
        `, function(result) {
            let prefs = {};
            
            // 【重要】読み込み時にバックスラッシュを置換してエラーを防ぐ
            if (result && result !== "null") {
                try {
                    prefs = JSON.parse(result.replace(/\\/g, "/"));
                } catch(e) {
                    console.error("Parse error:", e);
                }
            }
            
            // 既存データを保持しつつ更新
            prefs.settings = settings;
            prefs.noteCounts = {
                global: globalNotesCount,
                project: projectNotesCount
            };

            // 【最重要】もし prefs の読み込みに失敗していても、
            // 現在の変数が残っていれば強制的に書き込んで「初期化」を防ぐ
            if (!prefs.dataFolderPath && dataFolderPath) {
                prefs.dataFolderPath = dataFolderPath.replace(/\\/g, "/");
            }
            // セットアップ完了フラグを確実に立てる
            prefs.setupCompleted = true;

            // 保存完了を待ってから閉じる
            savePrefsFile(prefs, function() {
                setTimeout(closeWindow, 300);
            });
        });
    } else {
        closeWindow();
    }
}

// 設定ファイルを保存
function savePrefsFile(prefs, callback) {
    if (typeof CSInterface === 'undefined') {
        if (callback) callback();
        return;
    }

    const csInterface = new CSInterface();
    const extensionPath = csInterface.getSystemPath('extension');
    const jsonStr = JSON.stringify(prefs);
    
    csInterface.evalScript(`
        $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
        writeJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json", '${escapeForExtendScript(jsonStr)}');
    `, function() {
        if (callback) callback();
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
                // 【修正】取得したパスを即座に正規化
                const safePath = result.trim().replace(/\\/g, '/'); 
                
                settings.customPath = safePath;
                dataFolderPath = safePath; // グローバル変数を更新
                
                document.getElementById('custom-path-display').textContent = safePath;
                document.querySelector('input[name="storage-mode"][value="custom"]').checked = true;
                document.getElementById('current-storage-path').textContent = safePath; // 表示も即時更新

                // 設定を保存
                const csInterface = new CSInterface();
                const extensionPath = csInterface.getSystemPath('extension');
                
                csInterface.evalScript(`
                    $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
                    readJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json");
                `, function(prefResult) {
                    let prefs = {};
                    if (prefResult && prefResult !== 'null') {
                        try {
                            prefs = JSON.parse(prefResult.replace(/\\/g, "/"));
                        } catch(e) {}
                    }
                    
                    prefs.storageMode = 'custom';
                    prefs.dataFolderPath = safePath; // 正規化したパスを保存
                    prefs.setupCompleted = true;
                    prefs.settings = settings;
                    
                    savePrefsFile(prefs, function() {
                        alert('保存先フォルダを変更しました。変更を反映するには拡張機能を再起動してください。');
                    });
                });
            }
        });
        
    } catch(nodeError) {
        console.error('Node.js method failed:', nodeError);
        
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
                
                // 【修正】ここも同様に強制的にスラッシュに置換します
                const safePath = result.replace(/\\/g, '/'); 
                
                settings.customPath = safePath;
                document.getElementById('custom-path-display').textContent = safePath;
                document.querySelector('input[name="storage-mode"][value="custom"]').checked = true;
                
                dataFolderPath = safePath;
                document.getElementById('current-storage-path').textContent = safePath;
                
                
                const extensionPath = csInterface.getSystemPath('extension');
                csInterface.evalScript(`
                    $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
                    readJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json");
                `, function(prefResult) {
                    let prefs = {};
                    if (prefResult && prefResult !== 'null') {
                        try {
                            prefs = JSON.parse(prefResult);
                        } catch(e) {}
                    }
                    
                    prefs.storageMode = 'custom';
                    prefs.dataFolderPath = safePath;
                    prefs.settings = settings;
                    
                    savePrefsFile(prefs, function() {
                        alert('保存先フォルダを変更しました。変更を反映するには拡張機能を再起動してください。');
                    });
                });
            }
        });
    }
}

// データフォルダを開く
function openDataFolder() {
    if (typeof CSInterface === 'undefined') {
        alert('データフォルダが設定されていません');
        return;
    }
    
    const csInterface = new CSInterface();
    
    // 変数が空の場合、設定ファイルから再読み込みを試みる
    if (!dataFolderPath) {
        csInterface.evalScript(`
            (function() {
                var prefsFile = new File(Folder.myDocuments + "/MemoNotes/settings.json");
                if (prefsFile.exists) {
                    prefsFile.encoding = "UTF-8";
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
                    // 【重要】ここでもバックスラッシュを置換
                    const sanitizedResult = result.replace(/\\/g, "/");
                    const prefs = JSON.parse(sanitizedResult);
                    
                    // パスを取得し、再度置換して確実に安全にする
                    let path = prefs.dataFolderPath || '';
                    path = path.replace(/\\/g, "/");
                    
                    if (path) {
                        dataFolderPath = path; // グローバル変数も更新
                        openDataFolderWithPath(path);
                    } else {
                        alert('データフォルダが設定されていません');
                    }
                } catch(e) {
                    console.error('Failed to parse settings:', e);
                    alert('設定ファイルの読み込みに失敗しました');
                }
            } else {
                alert('データフォルダが設定されていません');
            }
        });
        return;
    }
    
    // すでに変数がある場合も、念のため置換してから渡す
    openDataFolderWithPath(dataFolderPath.replace(/\\/g, "/"));
}

function openDataFolderWithPath(path) {
    const csInterface = new CSInterface();
    const safePath = escapeForExtendScript(path);
    
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
            alert('フォルダを開けませんでした: ' + result);
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