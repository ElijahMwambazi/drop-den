package com.dropden.mobile;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

final class ShareStagingStore {
    static final long MAX_ITEM_BYTES = 1024L * 1024L * 1024L;
    static final long MAX_TOTAL_BYTES = 2L * 1024L * 1024L * 1024L;
    static final int MAX_ITEMS = 50;

    private static final String PREFERENCES = "drop_den_mobile";
    private static final String ITEMS_KEY = "pending_share_items";
    private static final String STATE_PENDING = "pending";
    private static final String STATE_UPLOADING = "uploading";
    private static final String STATE_FAILED = "failed";

    private final Context context;
    private final SharedPreferences preferences;
    private final File stagingDirectory;
    private final File legacyStagingDirectory;

    ShareStagingStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        this.stagingDirectory = new File(context.getFilesDir(), "share-staging");
        this.legacyStagingDirectory = new File(context.getFilesDir(), "share-inbox");
    }

    synchronized StageResult stage(Intent intent) {
        List<Uri> uris = extractUris(intent);
        List<String> rejected = new ArrayList<>();
        List<SharedItem> staged = new ArrayList<>();

        if (uris.isEmpty()) {
            rejected.add("The sending app did not provide a readable file.");
            return new StageResult(staged, rejected);
        }

        if (uris.size() > MAX_ITEMS) {
            rejected.add("A single share can contain at most 50 files.");
            return new StageResult(staged, rejected);
        }

        List<SharedItem> existing = loadItems();
        if (existing.size() + uris.size() > MAX_ITEMS) {
            rejected.add("Remove pending files before adding more than 50 staged items.");
            return new StageResult(staged, rejected);
        }

        long retainedBytes = totalBytes(existing);
        ContentResolver resolver = context.getContentResolver();

        for (int index = 0; index < uris.size(); index += 1) {
            Uri uri = uris.get(index);
            if (uri == null) {
                rejected.add("Shared file " + (index + 1) + ": the sending app provided an invalid URI.");
                continue;
            }
            String displayName = readDisplayName(resolver, uri, index);

            if (!"content".equalsIgnoreCase(uri.getScheme())) {
                rejected.add(displayName + ": only secure content URIs are supported.");
                continue;
            }

            long declaredSize = readDeclaredSize(resolver, uri);
            if (declaredSize > MAX_ITEM_BYTES) {
                rejected.add(displayName + ": files cannot exceed 1 GiB.");
                continue;
            }
            if (declaredSize >= 0 && retainedBytes + declaredSize > MAX_TOTAL_BYTES) {
                rejected.add(displayName + ": the private staging area cannot exceed 2 GiB.");
                continue;
            }

            String itemId = UUID.randomUUID().toString();
            File itemDirectory = new File(stagingDirectory, itemId);
            File partialFile = new File(itemDirectory, "content.part");
            File storedFile = new File(itemDirectory, "content");

            try {
                if (!itemDirectory.mkdirs() && !itemDirectory.isDirectory()) {
                    throw new IllegalStateException("Could not create private staging storage.");
                }

                long size = copyUri(
                        resolver,
                        uri,
                        partialFile,
                        MAX_ITEM_BYTES,
                        MAX_TOTAL_BYTES - retainedBytes
                );

                if (!partialFile.renameTo(storedFile)) {
                    throw new IllegalStateException("Could not commit the private staged file.");
                }

                SharedItem item = new SharedItem(
                        itemId,
                        displayName,
                        readMimeType(resolver, uri, intent.getType()),
                        size,
                        storedFile.getAbsolutePath(),
                        System.currentTimeMillis(),
                        STATE_PENDING,
                        null,
                        0L
                );

                existing.add(item);
                if (!persistItems(existing)) {
                    existing.remove(item);
                    deleteRecursively(itemDirectory);
                    throw new IllegalStateException("Could not save private staging metadata.");
                }

                retainedBytes += size;
                staged.add(item);
            } catch (SizeLimitException error) {
                deleteRecursively(itemDirectory);
                rejected.add(displayName + ": " + error.getMessage());
            } catch (Exception error) {
                deleteRecursively(itemDirectory);
                rejected.add(displayName + ": could not read this shared file.");
            }
        }

        return new StageResult(staged, rejected);
    }

    synchronized List<SharedItem> loadItems() {
        String value = preferences.getString(ITEMS_KEY, "[]");
        List<SharedItem> items = new ArrayList<>();
        boolean recoveredUpload = false;

        try {
            JSONArray array = new JSONArray(value);
            for (int index = 0; index < array.length(); index += 1) {
                SharedItem item = SharedItem.fromJson(array.getJSONObject(index));
                File storedFile = new File(item.storedPath);

                if (!storedFile.isFile()) {
                    deleteRecursively(storedFile.getParentFile());
                    continue;
                }

                if (STATE_UPLOADING.equals(item.state)) {
                    item.state = STATE_PENDING;
                    item.failureMessage = null;
                    recoveredUpload = true;
                }

                items.add(item);
            }
        } catch (Exception error) {
            clearDirectoryContents(stagingDirectory);
            preferences.edit().remove(ITEMS_KEY).commit();
            return items;
        }

        removeOrphanedDirectories(items);

        if (recoveredUpload || items.size() != countStoredItems(value)) {
            persistItems(items);
        }

        return items;
    }

    synchronized void markUploading(SharedItem item) {
        item.state = STATE_UPLOADING;
        item.failureMessage = null;
        item.lastAttemptAt = System.currentTimeMillis();
        updateItem(item);
    }

    synchronized void markFailed(SharedItem item, String message) {
        item.state = STATE_FAILED;
        item.failureMessage = message;
        item.lastAttemptAt = System.currentTimeMillis();
        updateItem(item);
    }

    synchronized void removeItem(SharedItem item) {
        List<SharedItem> items = loadItems();
        items.removeIf(existing -> existing.id.equals(item.id));
        persistItems(items);
        deleteRecursively(new File(item.storedPath).getParentFile());
    }

    synchronized void clear() {
        preferences.edit().remove(ITEMS_KEY).commit();
        clearDirectoryContents(stagingDirectory);
        clearDirectoryContents(legacyStagingDirectory);
    }

    private void updateItem(SharedItem item) {
        List<SharedItem> items = loadItems();
        for (int index = 0; index < items.size(); index += 1) {
            if (items.get(index).id.equals(item.id)) {
                items.set(index, item);
                persistItems(items);
                return;
            }
        }
    }

    private boolean persistItems(List<SharedItem> items) {
        JSONArray array = new JSONArray();
        for (SharedItem item : items) {
            array.put(item.toJson());
        }
        return preferences.edit().putString(ITEMS_KEY, array.toString()).commit();
    }

    private static long copyUri(
            ContentResolver resolver,
            Uri uri,
            File destination,
            long itemLimit,
            long remainingTotal
    ) throws Exception {
        try (
                InputStream input = resolver.openInputStream(uri);
                FileOutputStream output = new FileOutputStream(destination)
        ) {
            if (input == null) {
                throw new IllegalStateException("The shared URI could not be opened.");
            }

            byte[] buffer = new byte[64 * 1024];
            long size = 0L;
            int read;
            while ((read = input.read(buffer)) != -1) {
                size += read;
                if (size > itemLimit) {
                    throw new SizeLimitException("files cannot exceed 1 GiB.");
                }
                if (size > remainingTotal) {
                    throw new SizeLimitException("the private staging area cannot exceed 2 GiB.");
                }
                output.write(buffer, 0, read);
            }
            output.flush();
            return size;
        }
    }

    private static List<Uri> extractUris(Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            Uri uri = parcelableUri(intent, Intent.EXTRA_STREAM);
            return uri == null ? Collections.emptyList() : Collections.singletonList(uri);
        }
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return parcelableUriList(intent, Intent.EXTRA_STREAM);
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("deprecation")
    private static Uri parcelableUri(Intent intent, String key) {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(key, Uri.class);
        }
        return intent.getParcelableExtra(key);
    }

    @SuppressWarnings({"deprecation", "unchecked"})
    private static List<Uri> parcelableUriList(Intent intent, String key) {
        ArrayList<Uri> values;
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            values = intent.getParcelableArrayListExtra(key, Uri.class);
        } else {
            values = intent.getParcelableArrayListExtra(key);
        }
        return values == null ? Collections.emptyList() : values;
    }

    private static String readDisplayName(ContentResolver resolver, Uri uri, int index) {
        String value = null;
        try (Cursor cursor = resolver.query(
                uri,
                new String[]{OpenableColumns.DISPLAY_NAME},
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    value = cursor.getString(column);
                }
            }
        } catch (Exception ignored) {
            // The generated fallback below is safe and does not expose the URI.
        }

        String sanitized = sanitizeDisplayName(value);
        return sanitized.isEmpty() ? "shared-file-" + (index + 1) : sanitized;
    }

    private static long readDeclaredSize(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(
                uri,
                new String[]{OpenableColumns.SIZE},
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (column >= 0 && !cursor.isNull(column)) {
                    return cursor.getLong(column);
                }
            }
        } catch (Exception ignored) {
            // Unknown sizes are enforced while streaming.
        }
        return -1L;
    }

    private static String readMimeType(ContentResolver resolver, Uri uri, String fallback) {
        String value = null;
        try {
            value = resolver.getType(uri);
        } catch (Exception ignored) {
            // Some providers allow the stream but reject metadata queries.
        }
        if (value == null || value.trim().isEmpty()) {
            value = fallback;
        }
        if (value == null
                || value.length() > 127
                || !isConcreteMimeType(value)
                || value.contains("\r")
                || value.contains("\n")) {
            return "application/octet-stream";
        }
        return value.toLowerCase(Locale.ROOT);
    }

    private static boolean isConcreteMimeType(String value) {
        int slash = value.indexOf('/');
        return slash > 0
                && slash == value.lastIndexOf('/')
                && slash < value.length() - 1
                && value.indexOf('*') == -1
                && value.indexOf(';') == -1;
    }

    private static String sanitizeDisplayName(String value) {
        if (value == null) {
            return "";
        }

        StringBuilder result = new StringBuilder();
        for (int index = 0; index < value.length() && result.length() < 180; index += 1) {
            char character = value.charAt(index);
            if (character == '/' || character == '\\' || Character.isISOControl(character)) {
                result.append('_');
            } else {
                result.append(character);
            }
        }
        return result.toString().trim().replaceAll("^\\.+|\\.+$", "");
    }

    private static long totalBytes(List<SharedItem> items) {
        long total = 0L;
        for (SharedItem item : items) {
            total += item.size;
        }
        return total;
    }

    private static int countStoredItems(String value) {
        try {
            return new JSONArray(value).length();
        } catch (Exception error) {
            return 0;
        }
    }

    private void removeOrphanedDirectories(List<SharedItem> items) {
        Set<String> retainedIds = new HashSet<>();
        for (SharedItem item : items) {
            retainedIds.add(item.id);
        }

        removeOrphanedDirectories(stagingDirectory, retainedIds);
        removeOrphanedDirectories(legacyStagingDirectory, retainedIds);
    }

    private static void removeOrphanedDirectories(File directory, Set<String> retainedIds) {
        File[] children = directory.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            if (!retainedIds.contains(child.getName())) {
                deleteRecursively(child);
            }
        }
    }

    private static void clearDirectoryContents(File directory) {
        File[] children = directory.listFiles();
        if (children == null) {
            return;
        }
        for (File child : children) {
            deleteRecursively(child);
        }
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) {
            return;
        }
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        // Best-effort cleanup. A later startup recovery retries orphan removal.
        file.delete();
    }

    static final class StageResult {
        final List<SharedItem> staged;
        final List<String> rejected;

        StageResult(List<SharedItem> staged, List<String> rejected) {
            this.staged = staged;
            this.rejected = rejected;
        }
    }

    static final class SharedItem {
        final String id;
        final String displayName;
        final String mimeType;
        final long size;
        final String storedPath;
        final long receivedAt;
        String state;
        String failureMessage;
        long lastAttemptAt;

        SharedItem(
                String id,
                String displayName,
                String mimeType,
                long size,
                String storedPath,
                long receivedAt,
                String state,
                String failureMessage,
                long lastAttemptAt
        ) {
            this.id = id;
            this.displayName = displayName;
            this.mimeType = mimeType;
            this.size = size;
            this.storedPath = storedPath;
            this.receivedAt = receivedAt;
            this.state = state;
            this.failureMessage = failureMessage;
            this.lastAttemptAt = lastAttemptAt;
        }

        boolean isFailed() {
            return STATE_FAILED.equals(state);
        }

        JSONObject toJson() {
            JSONObject object = new JSONObject();
            try {
                object.put("id", id);
                object.put("display_name", displayName);
                object.put("mime_type", mimeType);
                object.put("size", size);
                object.put("stored_path", storedPath);
                object.put("received_at", receivedAt);
                object.put("state", state);
                object.put("failure_message", failureMessage == null ? JSONObject.NULL : failureMessage);
                object.put("last_attempt_at", lastAttemptAt);
            } catch (Exception error) {
                throw new IllegalStateException("Could not serialize pending share metadata.", error);
            }
            return object;
        }

        static SharedItem fromJson(JSONObject object) throws Exception {
            return new SharedItem(
                    object.getString("id"),
                    object.getString("display_name"),
                    object.optString("mime_type", "application/octet-stream"),
                    object.getLong("size"),
                    object.getString("stored_path"),
                    object.getLong("received_at"),
                    object.optString("state", STATE_PENDING),
                    object.isNull("failure_message") ? null : object.optString("failure_message"),
                    object.optLong("last_attempt_at", 0L)
            );
        }
    }

    private static final class SizeLimitException extends Exception {
        SizeLimitException(String message) {
            super(message);
        }
    }
}
