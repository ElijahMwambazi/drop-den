package com.dropden.mobile;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

final class TransferUploader {
    private static final String DEVICE_ID_HEADER = "X-Drop-Den-Device-Id";
    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 120_000;
    private static final int MAX_RESPONSE_BYTES = 64 * 1024;

    private TransferUploader() {
    }

    static HostConfig verifyHost(String host) throws Exception {
        HttpURLConnection connection = open(host + "/api/config");
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");

        try {
            int status = connection.getResponseCode();
            String body = readResponse(connection, status);
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("The server did not accept the host check.");
            }

            JSONObject config = new JSONObject(body);
            if (!"Drop Den".equals(config.optString("app_name"))) {
                throw new IllegalStateException("That address is not a Drop Den host.");
            }

            long serverLimit = config.optLong(
                    "max_upload_size_bytes",
                    SharedInboxStore.MAX_ITEM_BYTES
            );
            long uploadLimit = Math.max(
                    0L,
                    Math.min(serverLimit, SharedInboxStore.MAX_ITEM_BYTES)
            );
            return new HostConfig(uploadLimit);
        } finally {
            connection.disconnect();
        }
    }

    static UploadResult upload(
            String host,
            String deviceId,
            SharedInboxStore.SharedItem item
    ) {
        HttpURLConnection connection = null;
        try {
            File source = new File(item.storedPath);
            if (!source.isFile()) {
                return UploadResult.failure(0, "The staged file is no longer available.");
            }

            String boundary = "DropDen-" + UUID.randomUUID();
            connection = open(host + "/api/transfers/upload");
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setChunkedStreamingMode(64 * 1024);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty(DEVICE_ID_HEADER, deviceId);
            connection.setRequestProperty(
                    "Content-Type",
                    "multipart/form-data; boundary=" + boundary
            );

            try (
                    OutputStream output = connection.getOutputStream();
                    BufferedWriter writer = new BufferedWriter(
                            new OutputStreamWriter(output, StandardCharsets.UTF_8)
                    );
                    InputStream input = new BufferedInputStream(new FileInputStream(source))
            ) {
                writer.write("--" + boundary + "\r\n");
                writer.write("Content-Disposition: form-data; name=\"file\"; filename=\"");
                writer.write(asciiFilename(item.displayName));
                writer.write("\"\r\n");
                writer.write("Content-Type: " + safeMimeType(item.mimeType) + "\r\n\r\n");
                writer.flush();

                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.flush();

                writer.write("\r\n--" + boundary + "--\r\n");
                writer.flush();
            }

            int status = connection.getResponseCode();
            String body = readResponse(connection, status);
            if (status >= 200 && status < 300) {
                if (!isBroadcastTransferResponse(body)) {
                    return UploadResult.failure(
                            status,
                            "The host returned an unexpected transfer response."
                    );
                }
                return UploadResult.success(status);
            }
            return UploadResult.failure(status, responseMessage(body, status));
        } catch (Exception error) {
            return UploadResult.failure(0, "The upload was interrupted. Check the host and retry.");
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static boolean isBroadcastTransferResponse(String body) {
        try {
            JSONObject transfer = new JSONObject(body);
            return !transfer.optString("id").trim().isEmpty()
                    && "available".equals(transfer.optString("status"))
                    && transfer.isNull("target_device_id");
        } catch (Exception error) {
            return false;
        }
    }

    private static HttpURLConnection open(String address) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setUseCaches(false);
        connection.setInstanceFollowRedirects(false);
        return connection;
    }

    private static String readResponse(HttpURLConnection connection, int status) {
        InputStream stream = null;
        try {
            stream = status >= 200 && status < 400
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            if (stream == null) {
                return "";
            }

            StringBuilder response = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8)
            )) {
                char[] buffer = new char[2048];
                int read;
                while ((read = reader.read(buffer)) != -1
                        && response.length() < MAX_RESPONSE_BYTES) {
                    response.append(
                            buffer,
                            0,
                            Math.min(read, MAX_RESPONSE_BYTES - response.length())
                    );
                }
            }
            return response.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private static String responseMessage(String body, int status) {
        try {
            String message = new JSONObject(body).optString("message").trim();
            if (!message.isEmpty()) {
                return message;
            }
        } catch (Exception ignored) {
            // Fall back to a stable, non-server-specific message below.
        }

        if (status == HttpURLConnection.HTTP_UNAUTHORIZED) {
            return "Register this Android device with the den, then retry.";
        }
        if (status == HttpURLConnection.HTTP_ENTITY_TOO_LARGE) {
            return "This file exceeds the host upload limit.";
        }
        if (status == HttpURLConnection.HTTP_BAD_REQUEST) {
            return "The host could not read this transfer upload.";
        }
        if (status >= 500) {
            return "The host could not save this transfer. Retry in a moment.";
        }
        return "The host rejected this upload (HTTP " + status + ").";
    }

    private static String asciiFilename(String value) {
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < value.length() && result.length() < 180; index += 1) {
            char character = value.charAt(index);
            if (character < 32 || character > 126
                    || character == '"' || character == '\\'
                    || character == '/' || character == ';') {
                result.append('_');
            } else {
                result.append(character);
            }
        }
        String sanitized = result.toString().trim();
        return sanitized.isEmpty() ? "shared-file.bin" : sanitized;
    }

    private static String safeMimeType(String value) {
        if (value == null) {
            return "application/octet-stream";
        }
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        if (normalized.length() > 127
                || normalized.indexOf('/') <= 0
                || normalized.indexOf('/') != normalized.lastIndexOf('/')
                || normalized.endsWith("/")
                || normalized.contains("*")
                || normalized.contains(";")
                || normalized.contains("\r")
                || normalized.contains("\n")) {
            return "application/octet-stream";
        }
        return normalized;
    }

    static final class HostConfig {
        final long maxUploadBytes;

        HostConfig(long maxUploadBytes) {
            this.maxUploadBytes = maxUploadBytes;
        }
    }

    static final class UploadResult {
        final boolean success;
        final int status;
        final String message;

        private UploadResult(boolean success, int status, String message) {
            this.success = success;
            this.status = status;
            this.message = message;
        }

        static UploadResult success(int status) {
            return new UploadResult(true, status, "Uploaded");
        }

        static UploadResult failure(int status, String message) {
            return new UploadResult(false, status, message);
        }
    }
}
