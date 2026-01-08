// グローバル変数
let globalNotes = [];
let projectNotes = [];
let currentScope = 'global';
let editingId = null;
let searchActive = false;
let currentProjectPath = null;
let availableTags = [];
let selectedTags = [];
let dataFolderPath = null;
let setupCompleted = false;
let isInitialized = false;
let eventListenersSetup = false;

// 設定
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

// 初期化
function init() {
    if (isInitialized) return;
    isInitialized = true;
    checkSetupStatus();
}

// パス用のエスケープ（バックスラッシュをスラッシュに変換）
// ※これはファイルパス専用です。JSONデータには使用しないでください。
function escapeForExtendScript(str) {
    return str
        .replace(/\\/g, '/')
        .replace(/'/g, "\\'");
}

// JSONデータ用のエスケープ（JSXに渡すためにバックスラッシュとシングルクォートをエスケープ）
function escapeJsonForExtendScript(jsonStr) {
    return jsonStr
        .replace(/\\/g, "\\\\") // バックスラッシュを2重にする (\n -> \\n)
        .replace(/'/g, "\\'");  // シングルクォートをエスケープ
}

// セットアップ状態チェック
function checkSetupStatus() {
    console.log('checkSetupStatus called');
    
    if (typeof CSInterface === 'undefined') {
        console.log('CSInterface is undefined');
        showMainView();
        return;
    }

    const csInterface = new CSInterface();
    const extensionPath = csInterface.getSystemPath('extension');
    
    // 設定ファイルの読み込み
    csInterface.evalScript(`
        $.evalFile("${extensionPath}/file-utils.jsx");
        readJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json");
    `, function(result) {
        console.log('Prefs file result:', result);
        
        if (result && result !== 'null') {
            try {
                // パス区切り文字の正規化
                const sanitizedResult = result.replace(/\\/g, "/");
                const prefs = JSON.parse(sanitizedResult);
                
                console.log('Parsed prefs:', prefs);
                
                if (prefs.setupCompleted === true && prefs.dataFolderPath) {
                    dataFolderPath = prefs.dataFolderPath.replace(/\\/g, "/");
                    setupCompleted = true;
                    
                    if (prefs.settings) {
                        settings = Object.assign(settings, prefs.settings);
                    }
                    
                    console.log('Showing main view. Path:', dataFolderPath);
                    showMainView();
                } else {
                    console.log('setupCompleted is false or path missing, showing setup');
                    showSetupView();
                }
            } catch (e) {
                console.error('Failed to parse prefs:', e);
                showSetupView();
            }
        } else {
            console.log('No prefs file found');
            showSetupView();
        }
    });
}

// セットアップビューを表示
function showSetupView() {
    document.getElementById('setup-view').classList.remove('view-hidden');
    document.getElementById('main-view').classList.add('view-hidden');
    setupSetupViewListeners();
}

// メインビューを表示
function showMainView() {
    document.getElementById('setup-view').classList.add('view-hidden');
    document.getElementById('main-view').classList.remove('view-hidden');
    applySettings();
    initDataFolder();
    loadGlobalNotes();
    loadAvailableTags();
    getCurrentProject();
    setupEventListeners();
    renderNotes();
}

// 設定を適用
function applySettings() {
    document.documentElement.style.setProperty('--note-font-size', settings.noteFontSize + 'px');
    document.documentElement.style.setProperty('--editor-font-size', settings.editorFontSize + 'px');
    document.documentElement.style.setProperty('--note-line-height', settings.noteLineHeight);
}

// セットアップビューのイベントリスナー
function setupSetupViewListeners() {
    const options = document.querySelectorAll('.setup-option');
    const pathSelectionGroup = document.querySelector('.path-selection-group');
    let selectedOption = 'default';
    let selectedCustomPath = '';

    // オプション選択
    options.forEach(option => {
        option.addEventListener('click', function() {
            options.forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            selectedOption = this.dataset.option;

            if (selectedOption === 'custom') {
                pathSelectionGroup.style.display = 'block';
            } else {
                pathSelectionGroup.style.display = 'none';
            }
        });
    });

    // パス表示を更新
    function updatePathDisplay(path) {
        const display = document.getElementById('selected-path-display');
        const pathText = display.querySelector('.path-text');
        
        pathText.textContent = path;
        display.classList.add('has-path');
    }

    // フォルダ選択ボタン
    document.getElementById('browse-folder-btn').addEventListener('click', function() {
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
            const psFilePath = path.join(tempDir, 'select_folder_explorer.ps1');
            
            fs.writeFileSync(psFilePath, psScript, 'utf8');
            
            const command = `powershell.exe -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "${psFilePath}"`;
            
            exec(command, { encoding: 'utf8', maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
                try {
                    fs.unlinkSync(psFilePath);
                } catch(e) {
                    console.error('Failed to delete temp file:', e);
                }
                
                if (error) {
                    console.error('PowerShell execution error:', error);
                    alert('フォルダの選択に失敗しました');
                    return;
                }
                
                const result = stdout.trim();
                
                if (result && result.length > 0 && result !== 'null') {
                    selectedCustomPath = result;
                    updatePathDisplay(result);
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
                    selectedCustomPath = safePath;
                    updatePathDisplay(safePath);
                }
            });
        }
    });

    // スキップボタン
    document.getElementById('setup-skip-btn').addEventListener('click', function() {
        saveSetupPreferences('default', null);
    });

    // 続けるボタン
    document.getElementById('setup-continue-btn').addEventListener('click', function() {
        if (selectedOption === 'custom') {
            if (!selectedCustomPath) {
                alert('カスタムパスを選択してください');
                return;
            }
            saveSetupPreferences('custom', selectedCustomPath);
        } else {
            saveSetupPreferences('default', null);
        }
    });
}

// セットアップ設定を保存
function saveSetupPreferences(mode, customPath) {
    if (typeof CSInterface === 'undefined') {
        showMainView();
        return;
    }

    const csInterface = new CSInterface();
    const extensionPath = csInterface.getSystemPath('extension');

    csInterface.evalScript(`
        $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
        readJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json");
    `, function(existingData) {
        let prefs = {};
        
        if (existingData && existingData !== 'null') {
            try {
                prefs = JSON.parse(existingData);
            } catch(e) {
                console.error('Failed to parse existing settings:', e);
            }
        }

        if (mode === 'default') {
            csInterface.evalScript('Folder.myDocuments.fsName', function(docPath) {
                const folderPath = docPath.replace(/\\/g, '/') + '/MemoNotes';
                dataFolderPath = folderPath;
                
                prefs.setupCompleted = true;
                prefs.storageMode = 'default';
                prefs.dataFolderPath = folderPath;
                prefs.settings = settings;

                savePrefsFile(prefs);
                
                setTimeout(function() {
                    showMainView();
                }, 500);
            });
        } else {
            const folderPath = customPath.replace(/\\/g, '/');
            dataFolderPath = folderPath;
            
            prefs.setupCompleted = true;
            prefs.storageMode = 'custom';
            prefs.dataFolderPath = folderPath;
            prefs.settings = settings;

            savePrefsFile(prefs);
            
            setTimeout(function() {
                showMainView();
            }, 500);
        }
    });
}

// 設定ファイルを保存
function savePrefsFile(prefs) {
    if (typeof CSInterface === 'undefined') return;

    const csInterface = new CSInterface();
    const extensionPath = csInterface.getSystemPath('extension');
    const jsonStr = JSON.stringify(prefs);
    
    // ここは設定JSONなので、安全なエスケープ処理を使用
    const safeJson = escapeJsonForExtendScript(jsonStr);
    
    csInterface.evalScript(`
        $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
        writeJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json", '${safeJson}');
    `);
}

// データフォルダの初期化
function initDataFolder() {
    if (!dataFolderPath) {
        console.warn('dataFolderPath is not set');
        return;
    }
    
    if (typeof CSInterface === 'undefined') {
        return;
    }

    const csInterface = new CSInterface();
    const safePath = escapeForExtendScript(dataFolderPath);
    
    csInterface.evalScript(`
        (function() {
            var folder = new Folder("${safePath}");
            if (!folder.exists) {
                folder.create();
            }
            return folder.fsName;
        })()
    `);
}

// ファイルから読み込み
function readFromFile(filename, callback) {
    if (!dataFolderPath) {
        console.warn('dataFolderPath is not set');
        callback(null);
        return;
    }
    
    if (typeof CSInterface === 'undefined') {
        console.warn('CSInterface is undefined');
        callback(null);
        return;
    }

    const csInterface = new CSInterface();
    const extensionPath = csInterface.getSystemPath('extension');
    const safePath = escapeForExtendScript(dataFolderPath);
    const safeFilename = escapeForExtendScript(filename);
    
    csInterface.evalScript(`
        $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
        readJSONFile("${safePath}", "${safeFilename}");
    `, function(result) {
        if (result && result !== 'null' && result !== 'undefined') {
            try {
                // 読み込み時にパス区切り文字の問題が出ないようケア
                // ただしデータそのものにバックスラッシュが含まれる場合(正規表現など)への影響を避けるため
                // 単純な置換は行わずパースを試みる
                callback(JSON.parse(result));
            } catch (e) {
                console.error('Failed to parse JSON from file:', e);
                callback(null);
            }
        } else {
            callback(null);
        }
    });
}

// ファイルに保存
function writeToFile(filename, data) {
    if (!dataFolderPath) {
        console.warn('dataFolderPath is not set');
        return;
    }
    
    if (typeof CSInterface === 'undefined') {
        console.warn('CSInterface is undefined');
        return;
    }

    const csInterface = new CSInterface();
    const extensionPath = csInterface.getSystemPath('extension');
    
    // JSON文字列を生成 (ここでは \n が含まれる)
    const jsonStr = JSON.stringify(data);
    
    const safePath = escapeForExtendScript(dataFolderPath);
    const safeFilename = escapeForExtendScript(filename);
    
    // 【重要修正】ここで escapeForExtendScript を使うと \n が /n に置換されてしまう。
    // 代わりにJSONデータ専用のエスケープ処理を使用する。
    const safeJson = escapeJsonForExtendScript(jsonStr);
    
    csInterface.evalScript(`
        $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
        writeJSONFile("${safePath}", "${safeFilename}", '${safeJson}');
    `);
}

// After Effectsから現在のプロジェクトを取得
function getCurrentProject() {
    if (typeof CSInterface === 'undefined') {
        currentProjectPath = null;
        updateProjectInfo();
        return;
    }

    const csInterface = new CSInterface();
    csInterface.evalScript('(function() { if (app.project.file) { return app.project.file.fsName; } else { return null; } })()', function(result) {
        if (result && result !== 'null' && result !== 'undefined') {
            currentProjectPath = result;
            loadProjectNotes();
        } else {
            currentProjectPath = null;
        }
        updateProjectInfo();
        renderNotes();
    });
}

// プロジェクト情報表示を更新
function updateProjectInfo() {
    const projectInfo = document.getElementById('projectInfo');
    const projectName = document.getElementById('projectName');
    
    if (currentScope === 'project' && currentProjectPath) {
        const name = currentProjectPath.split(/[/\\]/).pop().replace('.aep', '');
        projectName.textContent = name;
        projectInfo.style.display = 'block';
    } else {
        projectInfo.style.display = 'none';
    }
}

// グローバルメモの読み込み
function loadGlobalNotes() {
    readFromFile('global-notes.json', function(data) {
        if (data) {
            globalNotes = data;
            renderNotes();
        }
    });
}

// グローバルメモの保存
function saveGlobalNotes() {
    writeToFile('global-notes.json', globalNotes);
}

// タグリストの読み込み
function loadAvailableTags() {
    readFromFile('available-tags.json', function(data) {
        if (data) {
            availableTags = data;
        } else {
            availableTags = ['リリック', 'アイデア', '作業中', 'TODO'];
            saveAvailableTags();
        }
    });
}

// タグリストの保存
function saveAvailableTags() {
    writeToFile('available-tags.json', availableTags);
}

// タグリストの描画
function renderTagList() {
    const tagList = document.getElementById('tagList');
    if (availableTags.length === 0) {
        tagList.innerHTML = '<div style="font-size: 10px; color: #808080; padding: 4px 0;">タグがありません</div>';
        return;
    }

    tagList.innerHTML = availableTags.map(tag => `
        <div class="tag-item ${selectedTags.includes(tag) ? 'selected' : ''}" data-tag="${escapeHtml(tag)}">
            ${escapeHtml(tag)}
            <button class="tag-item-remove" data-tag="${escapeHtml(tag)}" title="タグを削除">×</button>
        </div>
    `).join('');

    document.querySelectorAll('.tag-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('tag-item-remove')) return;
            const tag = item.dataset.tag;
            toggleTagSelection(tag);
        });
    });

    document.querySelectorAll('.tag-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeTag(btn.dataset.tag);
        });
    });
}

// タグ選択切り替え
function toggleTagSelection(tag) {
    const index = selectedTags.indexOf(tag);
    if (index > -1) {
        selectedTags.splice(index, 1);
    } else {
        selectedTags.push(tag);
    }
    renderTagList();
}

// タグを追加
function addNewTag() {
    const input = document.getElementById('newTagInput');
    const tagName = input.value.trim();
    
    if (!tagName) return;
    
    if (availableTags.includes(tagName)) {
        alert('このタグは既に存在します');
        return;
    }

    availableTags.push(tagName);
    saveAvailableTags();
    renderTagList();
    
    input.value = '';
    document.getElementById('tagAddInput').classList.remove('active');
}

// タグを削除
function removeTag(tag) {
    if (confirm(`タグ「${tag}」を削除しますか?`)) {
        availableTags = availableTags.filter(t => t !== tag);
        selectedTags = selectedTags.filter(t => t !== tag);
        saveAvailableTags();
        renderTagList();
    }
}

// プロジェクト専用メモの読み込み
function loadProjectNotes() {
    if (!currentProjectPath) {
        projectNotes = [];
        return;
    }
    
    const safePath = currentProjectPath.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `project-${safePath}.json`;
    
    readFromFile(filename, function(data) {
        if (data) {
            projectNotes = data;
        } else {
            projectNotes = [];
        }
        renderNotes();
    });
}

// プロジェクト専用メモの保存
function saveProjectNotes() {
    if (!currentProjectPath) return;
    
    const safePath = currentProjectPath.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `project-${safePath}.json`;
    
    writeToFile(filename, projectNotes);
}

// 現在のメモリストを取得
function getCurrentNotes() {
    return currentScope === 'global' ? globalNotes : projectNotes;
}

// メモの保存処理
function saveCurrentNotes() {
    if (currentScope === 'global') {
        saveGlobalNotes();
    } else {
        saveProjectNotes();
    }
}

// メモ一覧の描画
function renderNotes(filter = '') {
    const notesList = document.getElementById('notesList');
    const notes = getCurrentNotes();
    
    let filteredNotes = notes;
    if (filter) {
        filteredNotes = notes.filter(note => 
            note.content.toLowerCase().includes(filter.toLowerCase()) ||
            note.tags.some(tag => tag.toLowerCase().includes(filter.toLowerCase()))
        );
    }

    if (filteredNotes.length === 0) {
        const emptyMsg = filter ? 'メモが見つかりませんでした' : 
            (currentScope === 'project' && !currentProjectPath) ? 
            'プロジェクトを保存してください<br><span class="empty-hint">プロジェクト専用メモを使用するには、<br>プロジェクトファイルを保存する必要があります</span>' :
            'まだメモがありません<br><span class="empty-hint">新規メモボタンでメモを作成</span>';
        
        notesList.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" class="empty-icon">
                    <rect x="16" y="12" width="32" height="40" rx="2" stroke="currentColor" stroke-width="2"/>
                    <line x1="22" y1="22" x2="42" y2="22" stroke="currentColor" stroke-width="2"/>
                    <line x1="22" y1="28" x2="38" y2="28" stroke="currentColor" stroke-width="2"/>
                    <line x1="22" y1="34" x2="42" y2="34" stroke="currentColor" stroke-width="2"/>
                </svg>
                <div class="empty-text">${emptyMsg}</div>
            </div>
        `;
        return;
    }

    // 【重要修正】 style="white-space: pre-wrap;" を追加して改行を表示
    notesList.innerHTML = filteredNotes.map(note => `
        <div class="note-card" data-id="${note.id}">
            <div class="note-header">
                ${settings.showTimestampEnabled ? `<div class="note-timestamp">${formatDate(note.timestamp)}</div>` : '<div></div>'}
                <div class="note-actions">
                    <button class="note-action-btn edit-btn" data-id="${note.id}" title="編集">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        </svg>
                    </button>
                    <button class="note-action-btn delete-btn" data-id="${note.id}" title="削除">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 4h10M5 4V3h6v1M6 7v4M10 7v4" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M4 4h8v9a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="note-content" style="white-space: pre-wrap; word-break: break-word;">${escapeHtml(note.content.substring(0, 200))}${note.content.length > 200 ? '...' : ''}</div>
            ${note.tags.length > 0 ? note.tags.map(tag => `<span class="note-tag">${escapeHtml(tag)}</span>`).join('') : ''}
        </div>
    `).join('');

    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            editNote(btn.dataset.id);
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteNote(btn.dataset.id);
        });
    });
}

// 日付フォーマット
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
            const minutes = Math.floor(diff / (1000 * 60));
            return minutes === 0 ? 'たった今' : `${minutes}分前`;
        }
        return `${hours}時間前`;
    } else if (days === 1) {
        return '昨日';
    } else if (days < 7) {
        return `${days}日前`;
    } else {
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 新規メモ
function newNote() {
    if (currentScope === 'project' && !currentProjectPath) {
        alert('プロジェクト専用メモを使用するには、プロジェクトを保存してください。');
        return;
    }
    
    editingId = null;
    selectedTags = [];
    document.getElementById('editorTitle').textContent = '新規メモ';
    document.getElementById('noteTextarea').value = '';
    renderTagList();
    document.getElementById('editorSection').classList.add('active');
    document.getElementById('noteTextarea').focus();
}

// メモ編集
function editNote(id) {
    const notes = getCurrentNotes();
    const note = notes.find(n => n.id === id);
    if (!note) return;

    editingId = id;
    selectedTags = [...note.tags];
    document.getElementById('editorTitle').textContent = 'メモを編集';
    document.getElementById('noteTextarea').value = note.content;
    renderTagList();
    document.getElementById('editorSection').classList.add('active');
    document.getElementById('noteTextarea').focus();
}

// メモ保存
function saveNote() {
    const content = document.getElementById('noteTextarea').value.trim();
    if (!content) return;

    const notes = getCurrentNotes();

    if (editingId) {
        const note = notes.find(n => n.id === editingId);
        if (note) {
            note.content = content;
            note.tags = [...selectedTags];
            note.timestamp = Date.now();
        }
    } else {
        notes.unshift({
            id: Date.now().toString(),
            content: content,
            tags: [...selectedTags],
            timestamp: Date.now()
        });
    }

    saveCurrentNotes();
    renderNotes();
    closeEditor();
}

// メモ削除
function deleteNote(id) {
    const shouldConfirm = settings.confirmDeleteEnabled;
    
    if (shouldConfirm && !confirm('このメモを削除しますか?')) {
        return;
    }
    
    if (currentScope === 'global') {
        globalNotes = globalNotes.filter(n => n.id !== id);
        saveGlobalNotes();
    } else {
        projectNotes = projectNotes.filter(n => n.id !== id);
        saveProjectNotes();
    }
    renderNotes();
}

// エディタを閉じる
function closeEditor() {
    document.getElementById('editorSection').classList.remove('active');
    document.getElementById('tagAddInput').classList.remove('active');
    document.getElementById('newTagInput').value = '';
    editingId = null;
    selectedTags = [];
}

// 検索トグル
function toggleSearch() {
    searchActive = !searchActive;
    const searchBox = document.getElementById('searchBox');
    const searchInput = document.getElementById('searchInput');
    
    if (searchActive) {
        searchBox.style.display = 'block';
        searchInput.focus();
    } else {
        searchBox.style.display = 'none';
        searchInput.value = '';
        renderNotes();
    }
}

// スコープ切り替え
function switchScope(scope) {
    currentScope = scope;
    
    document.querySelectorAll('.scope-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.scope === scope);
    });
    
    if (scope === 'project') {
        getCurrentProject();
        loadProjectNotes();
    }
    
    updateProjectInfo();
    renderNotes();
}

// 設定ウィンドウを開く
function openSettingsWindow() {
    if (typeof CSInterface === 'undefined') {
        alert('CSInterfaceが利用できません');
        return;
    }

    const csInterface = new CSInterface();
    
    // メモ数をカウント
    const noteCounts = {
        global: globalNotes.length,
        project: projectNotes.length
    };
    
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
        let prefs = {};
        if (result && result !== 'null') {
            try {
                const sanitized = result.replace(/\\/g, '/');
                prefs = JSON.parse(sanitized);
            } catch(e) {
                console.error('Failed to parse settings:', e);
            }
        }
        
        prefs.noteCounts = noteCounts;
        
        const extensionPath = csInterface.getSystemPath('extension');
        const jsonStr = JSON.stringify(prefs);
        
        // 【重要修正】ここも JSONデータ専用のエスケープを使用
        const safeJson = escapeJsonForExtendScript(jsonStr);
        
        csInterface.evalScript(`
            $.evalFile("${escapeForExtendScript(extensionPath)}/file-utils.jsx");
            writeJSONFile(Folder.myDocuments.fsName + "/MemoNotes", "settings.json", '${safeJson}');
        `, function() {
            csInterface.requestOpenExtension('com.yourname.memonotes.settings', '');
        });
    });
}

// イベントリスナーの設定
function setupEventListeners() {

    if (eventListenersSetup) return;
    eventListenersSetup = true;

    // メインボタン
    document.getElementById('newNoteBtn').addEventListener('click', newNote);
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    document.getElementById('settingsBtn').addEventListener('click', openSettingsWindow); 
    
    // エディタ
    document.getElementById('saveNoteBtn').addEventListener('click', saveNote);
    document.getElementById('cancelBtn').addEventListener('click', closeEditor);
    document.getElementById('closeEditorBtn').addEventListener('click', closeEditor);
    
    // タグ管理
    document.getElementById('addTagBtn').addEventListener('click', () => {
        document.getElementById('tagAddInput').classList.toggle('active');
        document.getElementById('newTagInput').focus();
    });
    
    document.getElementById('saveNewTagBtn').addEventListener('click', addNewTag);
    
    document.getElementById('newTagInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addNewTag();
        }
    });
    
    // 検索
    document.getElementById('searchInput').addEventListener('input', (e) => {
        renderNotes(e.target.value);
    });
    
    // スコープタブ
    document.querySelectorAll('.scope-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchScope(tab.dataset.scope);
        });
    });

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'n') {
                e.preventDefault();
                newNote();
            } else if (e.key === 'f') {
                e.preventDefault();
                toggleSearch();
            } else if (e.key === 's' && document.getElementById('editorSection').classList.contains('active')) {
                e.preventDefault();
                saveNote();
            } else if (e.key === ',') {
                e.preventDefault();
                openSettingsWindow();
            }
        } else if (e.key === 'Escape') {
             if (document.getElementById('editorSection').classList.contains('active')) {
                closeEditor();
            }
        }
    });
}

// 起動時の初期化
init();