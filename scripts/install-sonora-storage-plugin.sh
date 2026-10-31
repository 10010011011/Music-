#!/usr/bin/env bash
set -euo pipefail

JAVA_DIR="android/app/src/main/java/app/sonora/player"
mkdir -p "$JAVA_DIR"

cat > "$JAVA_DIR/SonoraStoragePlugin.java" <<'JAVA'
package app.sonora.player;

import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "SonoraStorage")
public class SonoraStoragePlugin extends Plugin {
    private static final String PREFS = "sonora_persistent_storage";
    private static final String TREE_URI = "tree_uri";
    private static final String ROOT_NAME = "root_name";
    private static final String LIBRARY_NAME = "Sonora Library";

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "folderPicked");
    }

    @ActivityCallback
    public void folderPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != android.app.Activity.RESULT_OK || result.getData() == null) {
            call.reject("Folder selection cancelled", "CANCELLED");
            return;
        }

        Uri treeUri = result.getData().getData();
        if (treeUri == null) {
            call.reject("Android did not return a folder");
            return;
        }

        int flags = result.getData().getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (root == null || !root.isDirectory()) {
                call.reject("The selected location is not a usable folder");
                return;
            }

            DocumentFile library = root.findFile(LIBRARY_NAME);
            if (library != null && !library.isDirectory()) {
                library.delete();
                library = null;
            }
            if (library == null) library = root.createDirectory(LIBRARY_NAME);
            if (library == null || !library.isDirectory()) {
                call.reject("Could not create the Sonora Library folder here");
                return;
            }

            SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
            prefs.edit()
                .putString(TREE_URI, treeUri.toString())
                .putString(ROOT_NAME, root.getName() == null ? "Selected folder" : root.getName())
                .apply();

            call.resolve(statusObject());
        } catch (Exception e) {
            call.reject("Could not keep access to this folder: " + e.getMessage(), "STORAGE_PERMISSION_FAILED", e);
        }
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            call.resolve(statusObject());
        } catch (Exception e) {
            call.reject("Could not check storage access: " + e.getMessage(), "STORAGE_STATUS_FAILED", e);
        }
    }

    private JSObject statusObject() {
        JSObject out = new JSObject();
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(TREE_URI, null);
        String rootName = prefs.getString(ROOT_NAME, "Selected folder");
        boolean configured = false;
        String libraryUri = "";

        if (raw != null) {
            Uri treeUri = Uri.parse(raw);
            boolean persistedRead = false;
            boolean persistedWrite = false;
            for (android.content.UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
                if (permission.getUri().equals(treeUri)) {
                    persistedRead = permission.isReadPermission();
                    persistedWrite = permission.isWritePermission();
                    break;
                }
            }
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
            if (persistedRead && persistedWrite && root != null && root.exists() && root.isDirectory()) {
                DocumentFile library = root.findFile(LIBRARY_NAME);
                configured = library != null && library.exists() && library.isDirectory();
                if (configured) libraryUri = library.getUri().toString();
            }
        }

        out.put("configured", configured);
        out.put("folderName", configured ? rootName + "/" + LIBRARY_NAME : "");
        out.put("libraryUri", libraryUri);
        return out;
    }

    private DocumentFile getLibraryFolder(boolean create) throws Exception {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        String raw = prefs.getString(TREE_URI, null);
        if (raw == null) throw new IllegalStateException("Choose a library folder in Settings first");

        Uri treeUri = Uri.parse(raw);
        boolean granted = false;
        for (android.content.UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(treeUri) && permission.isReadPermission() && permission.isWritePermission()) {
                granted = true;
                break;
            }
        }
        if (!granted) throw new SecurityException("Folder permission is no longer available");

        DocumentFile root = DocumentFile.fromTreeUri(getContext(), treeUri);
        if (root == null || !root.exists()) throw new IllegalStateException("The selected folder is unavailable");

        DocumentFile folder = root.findFile(LIBRARY_NAME);
        if (folder == null && create) folder = root.createDirectory(LIBRARY_NAME);
        if (folder == null || !folder.exists() || !folder.isDirectory()) {
            throw new IllegalStateException("Sonora Library folder is missing");
        }
        return folder;
    }

    private String[] safeSegments(String path) {
        if (path == null || path.trim().isEmpty() || path.startsWith("/")) {
            throw new IllegalArgumentException("Invalid library file path");
        }
        String[] parts = path.replace("\\", "/").split("/");
        for (String part : parts) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || part.indexOf('\0') >= 0) {
                throw new IllegalArgumentException("Invalid library file path");
            }
        }
        return parts;
    }

    private DocumentFile findFile(String path, boolean createParents) throws Exception {
        String[] parts = safeSegments(path);
        DocumentFile current = getLibraryFolder(createParents);
        for (int i = 0; i < parts.length - 1; i++) {
            DocumentFile next = current.findFile(parts[i]);
            if (next == null && createParents) next = current.createDirectory(parts[i]);
            if (next == null || !next.isDirectory()) {
                throw new IllegalStateException("Could not open library subfolder");
            }
            current = next;
        }
        return current.findFile(parts[parts.length - 1]);
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (path == null || data == null) {
            call.reject("A file path and base64 data are required");
            return;
        }

        try {
            DocumentFile existing = findFile(path, true);
            if (existing != null && existing.exists() && !existing.delete()) {
                call.reject("Could not replace the existing library file");
                return;
            }

            String[] parts = safeSegments(path);
            DocumentFile parent = getLibraryFolder(true);
            for (int i = 0; i < parts.length - 1; i++) {
                DocumentFile next = parent.findFile(parts[i]);
                if (next == null) next = parent.createDirectory(parts[i]);
                if (next == null || !next.isDirectory()) throw new IllegalStateException("Could not create library folder");
                parent = next;
            }

            DocumentFile target = parent.createFile(mimeType, parts[parts.length - 1]);
            if (target == null) throw new IllegalStateException("Could not create library file");

            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            try (InputStream input = new ByteArrayInputStream(bytes);
                 OutputStream output = getContext().getContentResolver().openOutputStream(target.getUri(), "w")) {
                if (output == null) throw new IllegalStateException("Could not open library file for writing");
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                output.flush();
            }
            call.resolve(new JSObject().put("path", path).put("size", bytes.length));
        } catch (Exception e) {
            call.reject("Could not save " + path + ": " + e.getMessage(), "STORAGE_WRITE_FAILED", e);
        }
    }

    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("A library file path is required");
            return;
        }
        try {
            DocumentFile file = findFile(path, false);
            if (file == null || !file.isFile()) {
                call.reject("Library file not found: " + path, "FILE_NOT_FOUND");
                return;
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = getContext().getContentResolver().openInputStream(file.getUri())) {
                if (input == null) throw new IllegalStateException("Could not open library file");
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            }
            call.resolve(new JSObject().put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)));
        } catch (Exception e) {
            call.reject("Could not read " + path + ": " + e.getMessage(), "STORAGE_READ_FAILED", e);
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("A library file path is required");
            return;
        }
        try {
            DocumentFile file = findFile(path, false);
            boolean deleted = file != null && file.exists() && file.delete();
            call.resolve(new JSObject().put("deleted", deleted));
        } catch (Exception e) {
            call.reject("Could not delete " + path + ": " + e.getMessage(), "STORAGE_DELETE_FAILED", e);
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String path = call.getString("path", "");
        try {
            DocumentFile folder = path.isEmpty() ? getLibraryFolder(false) : findFile(path, false);
            if (folder == null || !folder.isDirectory()) throw new IllegalStateException("Library folder not found");
            JSObject result = new JSObject();
            com.getcapacitor.JSArray entries = new com.getcapacitor.JSArray();
            for (DocumentFile child : folder.listFiles()) {
                JSObject item = new JSObject();
                item.put("name", child.getName());
                item.put("directory", child.isDirectory());
                item.put("size", child.length());
                entries.put(item);
            }
            result.put("files", entries);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Could not list library files: " + e.getMessage(), "STORAGE_LIST_FAILED", e);
        }
    }
}
JAVA

MAIN="$JAVA_DIR/MainActivity.java"
if [ ! -f "$MAIN" ]; then
  echo "Expected Capacitor MainActivity at $MAIN" >&2
  exit 1
fi

cat > "$MAIN" <<'JAVA'
package app.sonora.player;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SonoraStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
JAVA

GRADLE="android/app/build.gradle"
if [ ! -f "$GRADLE" ]; then
  echo "Expected Gradle file at $GRADLE" >&2
  exit 1
fi
if ! grep -q 'androidx.documentfile:documentfile' "$GRADLE"; then
  sed -i '/dependencies[[:space:]]*{/a\    implementation "androidx.documentfile:documentfile:1.0.1"' "$GRADLE"
fi
