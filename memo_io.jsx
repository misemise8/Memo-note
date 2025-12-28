function selectMemoFolder() {
    var folder = Folder.selectDialog("メモの保存先を選択");
    return folder ? folder.fsName : null;
}

function saveMemoToFile(jsonText, scope, customPath, projectPath) {
    var baseFolder;

    if (customPath) {
        baseFolder = new Folder(customPath);
    } else if (scope === "global") {
        baseFolder = Folder.myDocuments;
    } else {
        baseFolder = new Folder(File(projectPath).parent.fsName);
    }

    if (!baseFolder.exists) baseFolder.create();

    var file = new File(baseFolder.fsName + "/ae_memo_notes_" + scope + ".json");
    file.encoding = "UTF-8";

    if (file.open("w")) {
        file.write(jsonText);
        file.close();
    }
}
