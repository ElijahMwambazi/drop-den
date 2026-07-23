package com.dropden.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.window.OnBackInvokedDispatcher;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.URLUtil;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String PREFERENCES = "drop_den_mobile";
    private static final String HOST_KEY = "host_url";
    private static final String DEVICE_ID_PREFIX = "device_id:";
    private static final String SESSION_TOKEN_PREFIX = "session_token:";
    private static final String DIRECT_SHARE_STAGING_MIGRATED_KEY =
            "direct_share_staging_migrated_v1";
    private static final long IDENTITY_POLL_MS = 1_000L;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int DOWNLOAD_PERMISSION_REQUEST_CODE = 1002;

    private static final int INK = Color.rgb(23, 23, 23);
    private static final int MUTED = Color.rgb(92, 92, 92);
    private static final int PAGE = Color.rgb(245, 245, 245);
    private static final int BORDER = Color.rgb(224, 224, 224);
    private static final int ERROR = Color.rgb(185, 28, 28);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> stageWarnings = new ArrayList<>();
    private final List<NativeShareQueueItem> nativeShareQueue = new ArrayList<>();

    private SharedPreferences preferences;
    private ShareStagingStore stagingStore;
    private EditText hostInput;
    private TextView status;
    private ProgressBar progress;
    private Button connectButton;
    private Button scanButton;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PendingDownload pendingDownload;
    private String currentHost = "";
    private long hostUploadLimit = ShareStagingStore.MAX_ITEM_BYTES;
    private boolean shareFlowActive;
    private boolean stagingShareIntent;
    private boolean awaitingIdentity;
    private boolean uploading;
    private boolean scanning;
    private boolean webViewLoaded;
    private boolean scrollToShareQueue;
    private Screen screen = Screen.CONNECTION;

    private final Runnable identityPoll = new Runnable() {
        @Override
        public void run() {
            if (!awaitingIdentity || webView == null || currentHost.isEmpty()) {
                return;
            }
            captureWebIdentity(currentHost, true);
            handler.postDelayed(this, IDENTITY_POLL_MS);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFERENCES, MODE_PRIVATE);
        migrateLegacyHostPreference();
        stagingStore = new ShareStagingStore(this);
        migrateLegacyShareStaging();
        registerPredictiveBackHandler();

        if (isShareIntent(getIntent())) {
            handleShareIntent(getIntent());
            return;
        }

        if (!stagingStore.loadItems().isEmpty()) {
            shareFlowActive = true;
            connectRememberedHostOrPrompt();
            return;
        }

        showConnectionScreen(false);
        connectRememberedHostIfPresent();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (isShareIntent(intent)) {
            handleShareIntent(intent);
        }
    }

    private void migrateLegacyHostPreference() {
        if (preferences.contains(HOST_KEY)) {
            return;
        }
        String legacyHost = getPreferences(MODE_PRIVATE).getString(HOST_KEY, "");
        if (!legacyHost.isEmpty()) {
            preferences.edit().putString(HOST_KEY, legacyHost).apply();
        }
    }

    private void migrateLegacyShareStaging() {
        if (preferences.getBoolean(DIRECT_SHARE_STAGING_MIGRATED_KEY, false)) {
            return;
        }

        // Never auto-publish files staged by an older inbox-based build.
        stagingStore.clear();
        preferences.edit().putBoolean(DIRECT_SHARE_STAGING_MIGRATED_KEY, true).apply();
    }

    private void registerPredictiveBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    () -> {
                        if (!handleBack()) {
                            finish();
                        }
                    }
            );
        }
    }

    private void handleShareIntent(Intent intent) {
        shareFlowActive = true;
        stagingShareIntent = true;
        awaitingIdentity = false;
        handler.removeCallbacks(identityPoll);
        String preparingItemId = "preparing-" + UUID.randomUUID();
        nativeShareQueue.add(new NativeShareQueueItem(
                preparingItemId,
                "Preparing shared files…",
                -1L,
                "queued",
                null,
                false
        ));

        String rememberedHost = preferences.getString(HOST_KEY, "");
        if (!rememberedHost.isEmpty()) {
            boolean reuseCurrentWebView = webView != null && rememberedHost.equals(currentHost);
            currentHost = rememberedHost;
            boolean waitForIdentity = !hasDeviceSession(rememberedHost);
            if (!reuseCurrentWebView) {
                openHost(rememberedHost, waitForIdentity);
            } else if (waitForIdentity) {
                startIdentityPolling();
            }
        } else {
            showConnectionScreen(true);
        }
        publishNativeShareQueue(true);

        executor.execute(() -> {
            ShareStagingStore.StageResult result = stagingStore.stage(intent);
            runOnUiThread(() -> {
                stagingShareIntent = false;
                nativeShareQueue.removeIf(item -> preparingItemId.equals(item.id));
                stageWarnings.addAll(result.rejected);
                syncNativeShareQueue(result.rejected);
                publishNativeShareQueue(true);
                if (result.staged.isEmpty() && stagingStore.loadItems().isEmpty()) {
                    shareFlowActive = false;
                    if (webView == null) {
                        showShareFailure();
                    }
                    return;
                }

                if (currentHost.isEmpty()) {
                    connectRememberedHostOrPrompt();
                    return;
                }

                ensureRegisteredDevice(currentHost);
            });
        });
    }

    private static boolean isShareIntent(Intent intent) {
        if (intent == null) {
            return false;
        }
        return Intent.ACTION_SEND.equals(intent.getAction())
                || Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction());
    }

    private void connectRememberedHostOrPrompt() {
        String rememberedHost = preferences.getString(HOST_KEY, "");
        if (!rememberedHost.isEmpty()) {
            currentHost = rememberedHost;
            syncNativeShareQueue(new ArrayList<>());
            boolean waitForIdentity = !hasDeviceSession(rememberedHost);
            openHost(rememberedHost, waitForIdentity);
            if (!waitForIdentity && !stagingShareIntent) {
                uploadPendingItems();
            }
            return;
        }

        showConnectionScreen(true);
        hostInput.setText(rememberedHost);
    }

    private void connectRememberedHostIfPresent() {
        String rememberedHost = preferences.getString(HOST_KEY, "");
        hostInput.setText(rememberedHost);
        if (!rememberedHost.isEmpty()) {
            connect(rememberedHost);
        }
    }

    private void showConnectionScreen(boolean forShare) {
        stopIdentityPolling();
        destroyWebView();
        screen = Screen.CONNECTION;

        LinearLayout card = card();
        card.addView(eyebrow("LOCAL-ONLY TRANSFER HUB"));
        card.addView(title(forShare ? "Choose a den" : "Connect to Drop Den"));
        card.addView(paragraph(
                forShare
                        ? "Select the Drop Den host that should publish these files for everyone in the den."
                        : "Enter the address shown on the host device. This wrapper remembers the last working den."
        ));

        hostInput = new EditText(this);
        hostInput.setSingleLine(true);
        hostInput.setHint("192.168.1.25:8080");
        hostInput.setTextColor(INK);
        hostInput.setHintTextColor(Color.rgb(150, 150, 150));
        hostInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        hostInput.setBackground(rounded(Color.WHITE, dp(12), BORDER));
        hostInput.setPadding(dp(14), dp(12), dp(14), dp(12));
        LinearLayout.LayoutParams inputParams = matchWrap();
        inputParams.setMargins(0, dp(10), 0, dp(10));
        card.addView(hostInput, inputParams);

        connectButton = actionButton(forShare ? "Continue" : "Connect", true);
        connectButton.setOnClickListener(view -> connect(hostInput.getText().toString()));
        card.addView(connectButton, matchWrap());

        TextView divider = text("OR", 11, MUTED);
        divider.setGravity(Gravity.CENTER);
        divider.setPadding(0, dp(8), 0, dp(8));
        card.addView(divider, matchWrap());

        scanButton = actionButton("Scan host QR code", false);
        scanButton.setOnClickListener(view -> startQrScan());
        card.addView(scanButton, matchWrap());

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        card.addView(progress, matchWrap());

        status = text("", 13, MUTED);
        status.setPadding(0, dp(10), 0, 0);
        card.addView(status, matchWrap());

        if (forShare) {
            TextView pending = text(
                    stagingStore.loadItems().size() + " file(s) waiting in private staging",
                    12,
                    MUTED
            );
            pending.setPadding(0, dp(12), 0, 0);
            card.addView(pending);
        }

        setContentView(centeredPage(card));
    }

    private void startQrScan() {
        if (scanning) {
            return;
        }

        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(this, options);

        setScanning(true, "Opening QR scanner…", false);
        scanner.startScan()
                .addOnSuccessListener(barcode -> handleScannedHost(barcode.getRawValue()))
                .addOnCanceledListener(() -> setScanning(false, "Scan canceled.", false))
                .addOnFailureListener(error -> setScanning(
                        false,
                        "Could not open the QR scanner. Enter the host address manually.",
                        true
                ));
    }

    private void handleScannedHost(String scannedValue) {
        final String host;
        try {
            host = normalizeHost(scannedValue);
        } catch (IllegalArgumentException error) {
            setScanning(
                    false,
                    "That QR code does not contain a valid Drop Den host address.",
                    true
            );
            return;
        }

        scanning = false;
        hostInput.setText(host);
        hostInput.setSelection(host.length());
        connect(host);
    }

    private void setScanning(boolean active, String message, boolean isError) {
        scanning = active;
        connectButton.setEnabled(!active);
        scanButton.setEnabled(!active);
        progress.setVisibility(active ? View.VISIBLE : View.GONE);
        status.setText(message);
        status.setTextColor(isError ? ERROR : MUTED);
    }

    private void connect(String rawHost) {
        final String host;
        try {
            host = normalizeHost(rawHost);
        } catch (IllegalArgumentException error) {
            status.setText(error.getMessage());
            status.setTextColor(ERROR);
            return;
        }

        setConnecting(true, "Checking host…");
        executor.execute(() -> {
            try {
                TransferUploader.HostConfig config = TransferUploader.verifyHost(host);
                runOnUiThread(() -> {
                    currentHost = host;
                    hostUploadLimit = config.maxUploadBytes;
                    preferences.edit().putString(HOST_KEY, host).apply();
                    if (shareFlowActive && !stagingStore.loadItems().isEmpty()) {
                        boolean waitForIdentity = !hasDeviceSession(host);
                        openHost(host, waitForIdentity);
                        if (!waitForIdentity) {
                            uploadPendingItems();
                        }
                    } else {
                        openHost(host, false);
                    }
                });
            } catch (Exception error) {
                runOnUiThread(() -> setConnecting(
                        false,
                        "Could not connect. Check the address and make sure the host is running."
                ));
            }
        });
    }

    static String normalizeHost(String rawHost) {
        String value = rawHost == null ? "" : rawHost.trim();
        if (value.isEmpty()) {
            throw new IllegalArgumentException("Enter a Drop Den host address.");
        }
        if (!value.contains("://")) {
            value = "http://" + value;
        }

        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme() == null
                    ? ""
                    : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!(scheme.equals("http") || scheme.equals("https"))
                    || uri.getHost() == null
                    || uri.getUserInfo() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))
                    || uri.getQuery() != null
                    || uri.getFragment() != null) {
                throw new IllegalArgumentException();
            }
            int port = uri.getPort();
            return scheme + "://" + uri.getHost() + (port == -1 ? "" : ":" + port);
        } catch (Exception error) {
            throw new IllegalArgumentException("Use an HTTP or HTTPS host address.");
        }
    }

    private void ensureRegisteredDevice(String host) {
        if (hasDeviceSession(host)) {
            if (webView == null) {
                openHost(host, false);
            }
            uploadPendingItems();
            return;
        }
        if (webView == null) {
            openHost(host, true);
        } else {
            startIdentityPolling();
        }
    }

    private void openHost(String host, boolean waitForIdentity) {
        stopIdentityPolling();
        destroyWebView();
        screen = Screen.WEBVIEW;
        currentHost = host;

        WebView view = new WebView(this);
        webView = view;
        webViewLoaded = false;
        view.setBackgroundColor(Color.WHITE);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setDatabaseEnabled(true);
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView source,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams chooserParams
            ) {
                return launchFileChooser(callback, chooserParams);
            }
        });
        view.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
                startDownload(
                        host,
                        url,
                        userAgent,
                        contentDisposition,
                        mimeType
                )
        );
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView source, WebResourceRequest request) {
                Uri target = request.getUrl();
                if ("dropden-native".equalsIgnoreCase(target.getScheme())) {
                    handleNativeShareAction(target);
                    return true;
                }
                return !isSameOrigin(target, host);
            }

            @Override
            public void onPageFinished(WebView source, String url) {
                webViewLoaded = true;
                publishNativeShareQueue(false);
                if (waitForIdentity) {
                    startIdentityPolling();
                } else {
                    captureWebIdentity(host, false);
                }
            }

            @Override
            public void onReceivedError(
                    WebView source,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    stopIdentityPolling();
                    showConnectionScreen(shareFlowActive);
                    hostInput.setText(host);
                    status.setText("The saved host is unavailable. Choose another address or retry.");
                    status.setTextColor(ERROR);
                }
            }
        });
        setContentView(view);
        view.loadUrl(host);

        if (waitForIdentity) {
            Toast.makeText(
                    this,
                    "Join this den on the page. Your transfer upload will start automatically.",
                    Toast.LENGTH_LONG
            ).show();
        }
    }

    private void startDownload(
            String host,
            String url,
            String userAgent,
            String contentDisposition,
            String mimeType
    ) {
        Uri target = Uri.parse(url);
        if (!isSameOrigin(target, host)) {
            Toast.makeText(
                    this,
                    "Drop Den blocked a download from an unexpected host.",
                    Toast.LENGTH_LONG
            ).show();
            return;
        }

        PendingDownload download = new PendingDownload(
                url,
                userAgent,
                mimeType,
                safeDownloadFileName(url, contentDisposition, mimeType)
        );

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                != PackageManager.PERMISSION_GRANTED) {
            pendingDownload = download;
            requestPermissions(
                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                    DOWNLOAD_PERMISSION_REQUEST_CODE
            );
            return;
        }

        enqueueDownload(download);
    }

    private void enqueueDownload(PendingDownload download) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(download.url));
            if (download.userAgent != null && !download.userAgent.isEmpty()) {
                request.addRequestHeader("User-Agent", download.userAgent);
            }
            if (download.mimeType != null && !download.mimeType.isEmpty()) {
                request.setMimeType(download.mimeType);
            }
            request.setTitle(download.fileName);
            request.setDescription("Downloading from Drop Den");
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            );
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    download.fileName
            );

            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) {
                throw new IllegalStateException("Android Download Manager is unavailable.");
            }
            manager.enqueue(request);
            Toast.makeText(
                    this,
                    "Downloading " + download.fileName,
                    Toast.LENGTH_SHORT
            ).show();
        } catch (Exception error) {
            Toast.makeText(
                    this,
                    "Could not start the download.",
                    Toast.LENGTH_LONG
            ).show();
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != DOWNLOAD_PERMISSION_REQUEST_CODE) {
            return;
        }

        PendingDownload download = pendingDownload;
        pendingDownload = null;
        if (download != null
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            enqueueDownload(download);
            return;
        }

        Toast.makeText(
                this,
                "Storage permission is required to save this file.",
                Toast.LENGTH_LONG
        ).show();
    }

    private static String safeDownloadFileName(
            String url,
            String contentDisposition,
            String mimeType
    ) {
        String guessed = URLUtil.guessFileName(url, contentDisposition, mimeType);
        String safe = guessed.replace('\\', '_').replace('/', '_').replace('\0', '_').trim();
        return safe.isEmpty() ? "drop-den-download" : safe;
    }

    private boolean launchFileChooser(
            ValueCallback<Uri[]> callback,
            WebChromeClient.FileChooserParams chooserParams
    ) {
        cancelFileChooser();
        fileChooserCallback = callback;

        try {
            Intent picker = chooserParams.createIntent();
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.putExtra(
                    Intent.EXTRA_ALLOW_MULTIPLE,
                    chooserParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE
            );
            startActivityForResult(
                    Intent.createChooser(picker, "Choose files for Drop Den"),
                    FILE_CHOOSER_REQUEST_CODE
            );
            return true;
        } catch (ActivityNotFoundException error) {
            cancelFileChooser();
            Toast.makeText(
                    this,
                    "No file picker is available on this device.",
                    Toast.LENGTH_LONG
            ).show();
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }

        ValueCallback<Uri[]> callback = fileChooserCallback;
        fileChooserCallback = null;
        if (callback == null) {
            return;
        }

        callback.onReceiveValue(
                resultCode == RESULT_OK ? selectedUris(data) : null
        );
    }

    private static Uri[] selectedUris(Intent data) {
        if (data == null) {
            return null;
        }

        ClipData clipData = data.getClipData();
        if (clipData != null && clipData.getItemCount() > 0) {
            Uri[] values = new Uri[clipData.getItemCount()];
            for (int index = 0; index < clipData.getItemCount(); index += 1) {
                values[index] = clipData.getItemAt(index).getUri();
            }
            return values;
        }

        Uri value = data.getData();
        return value == null ? null : new Uri[]{value};
    }

    private void cancelFileChooser() {
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
    }

    private void startIdentityPolling() {
        awaitingIdentity = true;
        handler.removeCallbacks(identityPoll);
        handler.post(identityPoll);
    }

    private void stopIdentityPolling() {
        awaitingIdentity = false;
        handler.removeCallbacks(identityPoll);
    }

    private void captureWebIdentity(String host, boolean continueShare) {
        WebView view = webView;
        if (view == null) {
            return;
        }
        view.evaluateJavascript(
                "(function(){return window.localStorage.getItem('drop-den-device') || '';})()",
                encodedValue -> {
                    String deviceId = decodeDeviceField(encodedValue, "id");
                    String sessionToken = decodeDeviceField(encodedValue, "session_token");
                    if (!isUuid(deviceId) || !isSessionToken(sessionToken)) {
                        return;
                    }
                    preferences.edit()
                            .putString(deviceKey(host), deviceId)
                            .putString(sessionTokenKey(host), sessionToken)
                            .apply();
                    if (continueShare && awaitingIdentity && shareFlowActive && !stagingShareIntent) {
                        stopIdentityPolling();
                        uploadPendingItems();
                    }
                }
        );
    }

    private static String decodeDeviceField(String encodedValue, String field) {
        try {
            String storedDevice = new JSONArray("[" + encodedValue + "]").getString(0);
            return new JSONObject(storedDevice).optString(field, "").trim();
        } catch (Exception error) {
            return "";
        }
    }

    private static boolean isSessionToken(String value) {
        return value != null
                && value.length() >= 32
                && value.matches("[A-Za-z0-9_-]+");
    }

    private static boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (Exception error) {
            return false;
        }
    }

    private static String deviceKey(String host) {
        return DEVICE_ID_PREFIX + host;
    }

    private static String sessionTokenKey(String host) {
        return SESSION_TOKEN_PREFIX + host;
    }

    private boolean hasDeviceSession(String host) {
        return isUuid(preferences.getString(deviceKey(host), ""))
                && isSessionToken(preferences.getString(sessionTokenKey(host), ""));
    }

    private void syncNativeShareQueue(List<String> rejected) {
        for (ShareStagingStore.SharedItem item : stagingStore.loadItems()) {
            NativeShareQueueItem queueItem = findNativeShareQueueItem(item.id);
            String state = item.isFailed() ? "error" : "queued";
            if (queueItem == null) {
                nativeShareQueue.add(new NativeShareQueueItem(
                        item.id,
                        item.displayName,
                        item.size,
                        state,
                        item.failureMessage,
                        true
                ));
            } else if (!"uploading".equals(queueItem.status)) {
                queueItem.status = state;
                queueItem.error = item.failureMessage;
            }
        }

        for (String warning : rejected) {
            nativeShareQueue.add(new NativeShareQueueItem(
                    "rejected-" + UUID.randomUUID(),
                    "Shared file",
                    -1L,
                    "error",
                    warning,
                    false
            ));
        }
    }

    private NativeShareQueueItem findNativeShareQueueItem(String id) {
        for (NativeShareQueueItem item : nativeShareQueue) {
            if (item.id.equals(id)) {
                return item;
            }
        }
        return null;
    }

    private void updateNativeShareQueueItem(String id, String state, String error) {
        NativeShareQueueItem item = findNativeShareQueueItem(id);
        if (item != null) {
            item.status = state;
            item.error = error;
        }
        publishNativeShareQueue(false);
    }

    private void publishNativeShareQueue(boolean scrollToQueue) {
        if (scrollToQueue) {
            scrollToShareQueue = true;
        }

        WebView view = webView;
        if (view == null || !webViewLoaded) {
            return;
        }

        JSONArray payload = new JSONArray();
        for (NativeShareQueueItem item : nativeShareQueue) {
            payload.put(item.toJson());
        }

        String script = "(function(){"
                + "const queue=" + payload + ";"
                + "window.__DROP_DEN_NATIVE_SHARE_QUEUE__=queue;"
                + "window.dispatchEvent(new CustomEvent('drop-den-native-share-queue',"
                + "{detail:queue}));"
                + (scrollToShareQueue
                    ? "document.querySelector('[data-drop-den-share-target]')?.scrollIntoView({behavior:'smooth',block:'start'});"
                    : "")
                + "})();";
        scrollToShareQueue = false;
        view.evaluateJavascript(script, null);
    }

    private void refreshWebTransfers() {
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('drop-den-native-transfer-complete'));",
                    null
            );
        }
    }

    private void handleNativeShareAction(Uri target) {
        String action = target.getLastPathSegment();
        if ("retry".equals(action)) {
            retryPendingItems();
            return;
        }
        if ("clear-completed".equals(action)) {
            nativeShareQueue.removeIf(item -> "success".equals(item.status)
                    || ("error".equals(item.status) && !item.retryable));
            publishNativeShareQueue(false);
            return;
        }
        if ("change-host".equals(action)) {
            showConnectionScreen(true);
            hostInput.setText(currentHost);
        }
    }

    private void uploadPendingItems() {
        if (uploading) {
            return;
        }
        List<ShareStagingStore.SharedItem> items = stagingStore.loadItems();
        if (items.isEmpty()) {
            shareFlowActive = false;
            publishNativeShareQueue(false);
            return;
        }

        String deviceId = preferences.getString(deviceKey(currentHost), "");
        String sessionToken = preferences.getString(sessionTokenKey(currentHost), "");
        if (!isUuid(deviceId) || !isSessionToken(sessionToken)) {
            ensureRegisteredDevice(currentHost);
            return;
        }

        uploading = true;
        syncNativeShareQueue(new ArrayList<>());
        publishNativeShareQueue(true);
        executor.execute(() -> {
            int successes = 0;
            boolean authExpired = false;
            long effectiveLimit = hostUploadLimit;

            try {
                effectiveLimit = TransferUploader.verifyHost(currentHost).maxUploadBytes;
            } catch (Exception ignored) {
                // Individual uploads below provide the retryable failure state.
            }

            for (int index = 0; index < items.size(); index += 1) {
                ShareStagingStore.SharedItem item = items.get(index);
                runOnUiThread(() -> updateNativeShareQueueItem(
                        item.id,
                        "uploading",
                        null
                ));

                if (item.size > effectiveLimit) {
                    stagingStore.markFailed(item, "This file exceeds the host upload limit.");
                    runOnUiThread(() -> updateNativeShareQueueItem(
                            item.id,
                            "error",
                            "This file exceeds the host upload limit."
                    ));
                    continue;
                }

                stagingStore.markUploading(item);
                TransferUploader.UploadResult result = TransferUploader.upload(
                        currentHost,
                        sessionToken,
                        item
                );
                if (result.success) {
                    stagingStore.removeItem(item);
                    runOnUiThread(() -> updateNativeShareQueueItem(
                            item.id,
                            "success",
                            null
                    ));
                    successes += 1;
                } else {
                    stagingStore.markFailed(item, result.message);
                    runOnUiThread(() -> updateNativeShareQueueItem(
                            item.id,
                            "error",
                            result.message
                    ));
                    if (result.status == 401) {
                        authExpired = true;
                    }
                }
            }

            int completedSuccesses = successes;
            boolean registrationExpired = authExpired;
            runOnUiThread(() -> {
                uploading = false;
                if (registrationExpired) {
                    preferences.edit()
                            .remove(deviceKey(currentHost))
                            .remove(sessionTokenKey(currentHost))
                            .apply();
                }
                shareFlowActive = !stagingStore.loadItems().isEmpty();
                publishNativeShareQueue(false);
                if (completedSuccesses > 0) {
                    refreshWebTransfers();
                }
                if (!registrationExpired && hasQueuedStagedItems()) {
                    uploadPendingItems();
                }
            });
        });
    }

    private boolean hasQueuedStagedItems() {
        for (ShareStagingStore.SharedItem item : stagingStore.loadItems()) {
            if (!item.isFailed()) {
                return true;
            }
        }
        return false;
    }

    private void retryPendingItems() {
        String deviceId = preferences.getString(deviceKey(currentHost), "");
        String sessionToken = preferences.getString(sessionTokenKey(currentHost), "");
        if (isUuid(deviceId) && isSessionToken(sessionToken)) {
            uploadPendingItems();
        } else {
            openHost(currentHost, true);
        }
    }

    private void showShareFailure() {
        screen = Screen.RESULT;
        LinearLayout card = card();
        card.addView(eyebrow("SHARE COULD NOT BE PREPARED"));
        card.addView(title("No files were added"));
        String message = stageWarnings.isEmpty()
                ? "The sending app did not provide a readable file."
                : String.join("\n", stageWarnings);
        card.addView(paragraph(message));
        Button close = actionButton("Close", true);
        close.setOnClickListener(view -> finish());
        card.addView(close, buttonParams());
        setContentView(centeredPage(card));
    }

    private void setConnecting(boolean connecting, String message) {
        connectButton.setEnabled(!connecting);
        if (scanButton != null) {
            scanButton.setEnabled(!connecting && !scanning);
        }
        progress.setVisibility(connecting ? View.VISIBLE : View.GONE);
        status.setText(message);
        status.setTextColor(connecting ? MUTED : ERROR);
    }

    private LinearLayout centeredPage(View child) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(20), dp(24), dp(20), dp(24));
        page.setBackgroundColor(PAGE);
        page.addView(child, matchWrap());
        return page;
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(24), dp(22), dp(24));
        card.setBackground(rounded(Color.WHITE, dp(20), BORDER));
        return card;
    }

    private TextView eyebrow(String value) {
        TextView view = text(value, 11, MUTED);
        view.setLetterSpacing(0.16f);
        return view;
    }

    private TextView title(String value) {
        TextView view = text(value, 27, INK);
        view.setPadding(0, dp(8), 0, dp(8));
        return view;
    }

    private TextView paragraph(String value) {
        TextView view = text(value, 14, MUTED);
        view.setLineSpacing(0, 1.18f);
        view.setPadding(0, 0, 0, dp(14));
        return view;
    }

    private Button actionButton(String value, boolean primary) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(value);
        button.setTextSize(14);
        button.setTextColor(primary ? Color.WHITE : INK);
        button.setBackgroundTintList(ColorStateList.valueOf(primary ? INK : Color.WHITE));
        button.setMinHeight(dp(48));
        return button;
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        return view;
    }

    private GradientDrawable rounded(int color, int radius, int stroke) {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(color);
        shape.setCornerRadius(radius);
        shape.setStroke(dp(1), stroke);
        return shape;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(0, dp(4), 0, dp(5));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static boolean safeEquals(String left, String right) {
        return left == null ? right == null : left.equalsIgnoreCase(right);
    }

    private static boolean isSameOrigin(Uri target, String host) {
        Uri allowed = Uri.parse(host);
        return safeEquals(target.getScheme(), allowed.getScheme())
                && safeEquals(target.getHost(), allowed.getHost())
                && target.getPort() == allowed.getPort();
    }

    private void destroyWebView() {
        cancelFileChooser();
        if (webView != null) {
            webView.stopLoading();
            webView.setDownloadListener(null);
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        webViewLoaded = false;
    }

    @Override
    @SuppressLint("GestureBackNavigation")
    public void onBackPressed() {
        if (!handleBack()) {
            super.onBackPressed();
        }
    }

    private boolean handleBack() {
        if (uploading) {
            Toast.makeText(this, "Wait for the current upload to finish.", Toast.LENGTH_SHORT).show();
            return true;
        }
        if (screen == Screen.WEBVIEW && hasRegisteredDeviceForCurrentHost()) {
            return false;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        if (screen == Screen.WEBVIEW && shareFlowActive) {
            showConnectionScreen(true);
            hostInput.setText(currentHost);
            return true;
        }
        if (screen == Screen.WEBVIEW) {
            showConnectionScreen(false);
            hostInput.setText(preferences.getString(HOST_KEY, ""));
            return true;
        }
        if (screen == Screen.RESULT
                && !stagingStore.loadItems().isEmpty()) {
            showConnectionScreen(true);
            hostInput.setText(currentHost);
            return true;
        }
        return false;
    }

    private boolean hasRegisteredDeviceForCurrentHost() {
        return !currentHost.isEmpty()
                && hasDeviceSession(currentHost);
    }

    @Override
    protected void onDestroy() {
        stopIdentityPolling();
        destroyWebView();
        executor.shutdownNow();
        super.onDestroy();
    }

    private enum Screen {
        CONNECTION,
        WEBVIEW,
        RESULT
    }

    private static final class PendingDownload {
        final String url;
        final String userAgent;
        final String mimeType;
        final String fileName;

        PendingDownload(String url, String userAgent, String mimeType, String fileName) {
            this.url = url;
            this.userAgent = userAgent;
            this.mimeType = mimeType;
            this.fileName = fileName;
        }
    }

    private static final class NativeShareQueueItem {
        final String id;
        final String name;
        final long size;
        final boolean retryable;
        String status;
        String error;

        NativeShareQueueItem(
                String id,
                String name,
                long size,
                String status,
                String error,
                boolean retryable
        ) {
            this.id = id;
            this.name = name;
            this.size = size;
            this.status = status;
            this.error = error;
            this.retryable = retryable;
        }

        JSONObject toJson() {
            JSONObject value = new JSONObject();
            try {
                value.put("id", id);
                value.put("name", name);
                value.put("size", size < 0 ? JSONObject.NULL : size);
                value.put("status", status);
                value.put("error", error == null ? JSONObject.NULL : error);
                value.put("retryable", retryable);
            } catch (Exception ignored) {
                // Values are local primitives and cannot fail normal JSON serialization.
            }
            return value;
        }
    }
}
