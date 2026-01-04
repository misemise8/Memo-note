// ファイル書き込み用のユーティリティ関数
function writeJSONFile(folderPath, fileName, jsonData) {
    try {
        var folder = new Folder(folderPath);
        if (!folder.exists) {
            folder.create();
        }
        
        var file = new File(folder.fsName + "/" + fileName);
        file.encoding = "UTF-8";
        
        if (file.open("w")) {
            file.write(jsonData);
            file.close();
            return file.fsName;
        }
        return "error: Could not open file for writing";
    } catch(e) {
        return "error: " + e.toString();
    }
}

function readJSONFile(folderPath, fileName) {
    try {
        var file = new File(folderPath + "/" + fileName);
        if (file.exists) {
            file.encoding = "UTF-8";
            file.open("r");
            var content = file.read();
            file.close();
            return content;
        }
        return null;
    } catch(e) {
        return null;
    }
}