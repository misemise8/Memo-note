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

// パス用のエスケープ（既存の関数）
function escapeForExtendScript(str) {
    return str
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'");
}

// JSONデータ用のエスケープ（新規追加）
function escapeJsonForExtendScript(jsonStr) {
    return jsonStr
        .replace(/\\/g, "\\\\") // バックスラッシュを2重にする
        .replace(/'/g, "\\'");  // シングルクォートをエスケープ
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
                const sanitizedResult = result.replace(/\\/g, "/");
                const prefs = JSON.parse(sanitizedResult);
                
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
        } else {
            csInterface.evalScript('Folder.myDocuments.fsName + "/MemoNotes"', function(defaultPath) {
                if (defaultPath) {
                    dataFolderPath = defaultPath.replace(/\\/g, '/');
                }
                loadSettingsToUI();
            });
            return;
        }
        
        loadSettingsToUI();
    });
}

// 設定をUIに反映
function loadSettingsToUI() {
    const storageMode = settings.storageMode || 'default';
    const modeRadio = document.querySelector(`input[name="storage-mode"][value="${storageMode}"]`);
    if (modeRadio) modeRadio.checked = true;
    
    if (dataFolderPath) {
        document.getElementById('custom-path-display').textContent = dataFolderPath;
    }
    
    document.getElementById('note-font-size').value = settings.noteFontSize;
    document.getElementById('note-font-size-value').textContent = settings.noteFontSize + 'px';
    
    document.getElementById('editor-font-size').value = settings.editorFontSize;
    document.getElementById('editor-font-size-value').textContent = settings.editorFontSize + 'px';
    
    document.getElementById('note-line-height').value = settings.noteLineHeight;
    document.getElementById('note-line-height-value').textContent = settings.noteLineHeight;
    
    document.getElementById('auto-save-enabled').checked = settings.autoSaveEnabled;
    document.getElementById('confirm-delete-enabled').checked = settings.confirmDeleteEnabled;
    document.getElementById('show-timestamp-enabled').checked = settings.showTimestampEnabled;
    
    document.getElementById('current-storage-path').textContent = dataFolderPath || '未設定';
    document.getElementById('global-notes-count').textContent = globalNotesCount;
    document.getElementById('project-notes-count').textContent = projectNotesCount;
}

// 設定を保存
function saveSettings() {
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
        
        csInterface.evalScript(`
            $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
            readJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json");
        `, function(result) {
            let prefs = {};
            
            if (result && result !== "null") {
                try {
                    prefs = JSON.parse(result.replace(/\\/g, "/"));
                } catch(e) {
                    console.error("Parse error:", e);
                }
            }
            
            prefs.settings = settings;
            prefs.noteCounts = {
                global: globalNotesCount,
                project: projectNotesCount
            };

            if (!prefs.dataFolderPath && dataFolderPath) {
                prefs.dataFolderPath = dataFolderPath.replace(/\\/g, "/");
            }
            prefs.setupCompleted = true;

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
    
    // 【重要修正】JSONデータ専用のエスケープを使用
    const safeJson = escapeJsonForExtendScript(jsonStr);
    
    csInterface.evalScript(`
        $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
        writeJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json", '${safeJson}');
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
                const safePath = result.trim().replace(/\\/g, '/'); 
                
                settings.customPath = safePath;
                dataFolderPath = safePath;
                
                document.getElementById('custom-path-display').textContent = safePath;
                document.querySelector('input[name="storage-mode"][value="custom"]').checked = true;
                document.getElementById('current-storage-path').textContent = safePath;

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
                    prefs.dataFolderPath = safePath;
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
        alert('CSInterfaceが利用できません');
        return;
    }
    
    const csInterface = new CSInterface();
    
    if (dataFolderPath && dataFolderPath.length > 0) {
        openDataFolderWithPath(dataFolderPath);
        return;
    }
    
    csInterface.evalScript(`
        (function() {
            var defaultPath = Folder.myDocuments.fsName + "/MemoNotes";
            try {
                var settingsFile = new File(Folder.myDocuments.fsName + "/MemoNotes/settings.json");
                if (settingsFile.exists) {
                    settingsFile.encoding = "UTF-8";
                    settingsFile.open("r");
                    var content = settingsFile.read();
                    settingsFile.close();
                    
                    var prefs = eval("(" + content + ")");
                    if (prefs.dataFolderPath) {
                        return prefs.dataFolderPath;
                    }
                }
            } catch(e) {}
            return defaultPath;
        })()
    `, function(result) {
        if (result && result !== 'null' && result !== 'undefined') {
            const path = result.replace(/\\/g, '/');
            dataFolderPath = path;
            openDataFolderWithPath(path);
        } else {
            alert('データフォルダのパスを取得できませんでした');
        }
    });
}

function openDataFolderWithPath(path) {
    const csInterface = new CSInterface();
    const normalizedPath = path.replace(/\\/g, '/');
    const safePath = escapeForExtendScript(normalizedPath);
    
    csInterface.evalScript(`
        (function() {
            try {
                var folder = new Folder("${safePath}");
                if (folder.exists) {
                    folder.execute();
                    return "success";
                } else {
                    return "folder not found: " + folder.fsName;
                }
            } catch(e) {
                return "error: " + e.toString();
            }
        })()
    `, function(result) {
        if (result !== 'success') {
            alert('フォルダを開けませんでした:\n' + result);
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
    document.getElementById('save-btn').addEventListener('click', saveSettings);
    document.getElementById('cancel-btn').addEventListener('click', closeWindow);
    
    document.getElementById('note-font-size').addEventListener('input', (e) => {
        document.getElementById('note-font-size-value').textContent = e.target.value + 'px';
    });
    
    document.getElementById('editor-font-size').addEventListener('input', (e) => {
        document.getElementById('editor-font-size-value').textContent = e.target.value + 'px';
    });
    
    document.getElementById('note-line-height').addEventListener('input', (e) => {
        document.getElementById('note-line-height-value').textContent = e.target.value;
    });
    
    document.getElementById('change-path-btn').addEventListener('click', changeStoragePath);
    document.getElementById('open-folder-btn').addEventListener('click', openDataFolder);
    
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