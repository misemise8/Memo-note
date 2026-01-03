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
                prefsFile.encoding = "UTF-8"; // エンコードを明示的に指定
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
                // 【重要】Windowsパスの \ を / に置換してパースエラーを防ぐ
                var sanitizedResult = result.replace(/\\/g, "/");
                const prefs = JSON.parse(sanitizedResult);
                
                // dataFolderPathの取得（settings.htmlでの変数名に合わせて修正）
                // prefs.customPath または prefs.dataFolderPath
                dataFolderPath = prefs.customPath || prefs.dataFolderPath || ''; 
                
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
    // 1. 現在のUIから設定値を集める
    settings.noteFontSize = parseInt(document.getElementById('note-font-size').value);
    settings.editorFontSize = parseInt(document.getElementById('editor-font-size').value);
    settings.noteLineHeight = parseFloat(document.getElementById('note-line-height').value);
    
    // チェックボックスのIDが HTML(settings.html) と一致しているか注意
    // もし HTML側が 'auto-save-toggle' ならそれに合わせる必要があります
    settings.autoSaveEnabled = document.getElementById('auto-save-toggle')?.checked || false;
    settings.confirmDeleteEnabled = document.getElementById('confirm-delete-toggle')?.checked || false;
    settings.showTimestampEnabled = document.getElementById('show-timestamp-toggle')?.checked || false;
    
    const selectedMode = document.querySelector('input[name="storage-mode"]:checked').value;
    settings.storageMode = selectedMode;
    
    // カスタムパス（もしあれば）も取得
    const customPathInput = document.getElementById('custom-path-input');
    const currentCustomPath = customPathInput ? customPathInput.value.replace(/\\/g, "/") : "";

    if (typeof CSInterface !== 'undefined') {
        const csInterface = new CSInterface();
        
        // 【修正ポイント】既存ファイルの有無にかかわらず、保存を実行する流れにする
        csInterface.evalScript(`
            (function() {
                var prefsFile = new File(Folder.userData + "/MemoNotesPrefs.json");
                if (prefsFile.exists) {
                    prefsFile.encoding = "UTF-8";
                    prefsFile.open("r");
                    var content = prefsFile.read();
                    prefsFile.close();
                    return content;
                }
                return "empty"; // ファイルがない場合は文字列 "empty" を返す
            })()
        `, function(result) {
            let prefs = {};
            
            if (result && result !== "empty" && result !== "null") {
                try {
                    // 既存のデータを壊さないように読み込む
                    prefs = JSON.parse(result.replace(/\\/g, "/"));
                } catch(e) {
                    console.error("Parse error:", e);
                }
            }
            
            // 2. データを更新（新規作成時もここを通る）
            prefs.settings = settings;
            prefs.storageMode = settings.storageMode;
            prefs.customPath = currentCustomPath; // 重要：パスを保存に含める
            
            // 3. 保存実行
            savePrefsFile(prefs);
        });
    }
    
    closeWindow();
}

// 設定ファイルを保存
function savePrefsFile(prefs) {
    if (typeof CSInterface === 'undefined') return;

    const csInterface = new CSInterface();
    // JSON文字列化
    const jsonStr = JSON.stringify(prefs);
    // パスに含まれるバックスラッシュ等が壊れないよう、安全にエンコードして渡す
    const encodedJson = encodeURIComponent(jsonStr); 

    csInterface.evalScript(`
        (function() {
            try {
                var prefsFile = new File(Folder.userData + "/MemoNotesPrefs.json");
                prefsFile.encoding = "UTF-8";
                prefsFile.open("w");
                // 渡された文字列をデコードして書き込む
                var data = decodeURIComponent("${encodedJson}");
                prefsFile.write(data);
                prefsFile.close();
                return "success";
            } catch(e) {
                return "error: " + e.toString();
            }
        })()
    `, function(result) {
        console.log('Settings: Prefs save result:', result);
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