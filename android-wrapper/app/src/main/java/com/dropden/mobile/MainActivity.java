package com.dropden.mobile;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
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
    private static final String DIRECT_SHARE_STAGING_MIGRATED_KEY =
            "direct_share_staging_migrated_v1";
    private static final long IDENTITY_POLL_MS = 1_000L;
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;

    private static final int INK = Color.rgb(23, 23, 23);
    private static final int MUTED = Color.rgb(92, 92, 92);
    private static final int PAGE = Color.rgb(245, 245, 245);
    private static final int BORDER = Color.rgb(224, 224, 224);
    private static final int ERROR = Color.rgb(185, 28, 28);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> stageWarnings = new ArrayList<>();

    private SharedPreferences preferences;
    private ShareStagingStore stagingStore;
    private EditText hostInput;
    private TextView status;
    private ProgressBar progress;
    private Button connectButton;
    private Button scanButton;
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private String currentHost = "";
    private long hostUploadLimit = ShareStagingStore.MAX_ITEM_BYTES;
    private boolean shareFlowActive;
    private boolean awaitingIdentity;
    private boolean uploading;
    private boolean scanning;
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
        awaitingIdentity = false;
        handler.removeCallbacks(identityPoll);
        showBusyScreen("Preparing shared files…", "Copying files into private app storage.");

        executor.execute(() -> {
            ShareStagingStore.StageResult result = stagingStore.stage(intent);
            runOnUiThread(() -> {
                stageWarnings.addAll(result.rejected);
                if (result.staged.isEmpty() && stagingStore.loadItems().isEmpty()) {
                    showShareFailure();
                    return;
                }
                connectRememberedHostOrPrompt();
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
        showConnectionScreen(true);
        hostInput.setText(rememberedHost);
        if (!rememberedHost.isEmpty()) {
            connect(rememberedHost);
        }
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
                        ensureRegisteredDevice(host);
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
        String savedDeviceId = preferences.getString(deviceKey(host), "");
        if (isUuid(savedDeviceId)) {
            uploadPendingItems();
            return;
        }
        openHost(host, true);
    }

    private void openHost(String host, boolean waitForIdentity) {
        stopIdentityPolling();
        destroyWebView();
        screen = Screen.WEBVIEW;
        currentHost = host;

        WebView view = new WebView(this);
        webView = view;
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
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView source, WebResourceRequest request) {
                Uri target = request.getUrl();
                Uri allowed = Uri.parse(host);
                boolean sameOrigin = safeEquals(target.getScheme(), allowed.getScheme())
                        && safeEquals(target.getHost(), allowed.getHost())
                        && target.getPort() == allowed.getPort();
                return !sameOrigin;
            }

            @Override
            public void onPageFinished(WebView source, String url) {
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
                    String deviceId = decodeDeviceId(encodedValue);
                    if (!isUuid(deviceId)) {
                        return;
                    }
                    preferences.edit().putString(deviceKey(host), deviceId).apply();
                    if (continueShare && awaitingIdentity && shareFlowActive) {
                        stopIdentityPolling();
                        uploadPendingItems();
                    }
                }
        );
    }

    private static String decodeDeviceId(String encodedValue) {
        try {
            String storedDevice = new JSONArray("[" + encodedValue + "]").getString(0);
            return new JSONObject(storedDevice).optString("id", "").trim();
        } catch (Exception error) {
            return "";
        }
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

    private View sharedItemRow(ShareStagingStore.SharedItem item) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(14), dp(13), dp(14), dp(13));
        row.setBackground(rounded(Color.WHITE, dp(14), BORDER));

        TextView filename = text(item.displayName, 15, INK);
        filename.setMaxLines(2);
        row.addView(filename, matchWrap());

        TextView details = text(formatBytes(item.size) + " · " + item.mimeType, 12, MUTED);
        details.setPadding(0, dp(4), 0, 0);
        row.addView(details, matchWrap());

        if (item.isFailed() && item.failureMessage != null) {
            TextView failure = text(item.failureMessage, 12, ERROR);
            failure.setPadding(0, dp(7), 0, 0);
            row.addView(failure, matchWrap());
        }

        Button remove = actionButton("Remove", false);
        remove.setTextColor(ERROR);
        remove.setOnClickListener(view -> {
            stagingStore.removeItem(item);
            showUploadResult(0, stagingStore.loadItems().size(), false);
        });
        LinearLayout.LayoutParams removeParams = wrapWrap();
        removeParams.gravity = Gravity.END;
        removeParams.setMargins(0, dp(8), 0, 0);
        row.addView(remove, removeParams);

        LinearLayout.LayoutParams rowParams = matchWrap();
        rowParams.setMargins(0, 0, 0, dp(10));
        row.setLayoutParams(rowParams);
        return row;
    }

    private void uploadPendingItems() {
        if (uploading) {
            return;
        }
        List<ShareStagingStore.SharedItem> items = stagingStore.loadItems();
        if (items.isEmpty()) {
            showUploadResult(0, 0, false);
            return;
        }

        String deviceId = preferences.getString(deviceKey(currentHost), "");
        if (!isUuid(deviceId)) {
            ensureRegisteredDevice(currentHost);
            return;
        }

        uploading = true;
        showUploadProgress(items.size());
        executor.execute(() -> {
            int successes = 0;
            int failures = 0;
            boolean authExpired = false;
            long effectiveLimit = hostUploadLimit;

            try {
                effectiveLimit = TransferUploader.verifyHost(currentHost).maxUploadBytes;
            } catch (Exception ignored) {
                // Individual uploads below provide the retryable failure state.
            }

            for (int index = 0; index < items.size(); index += 1) {
                ShareStagingStore.SharedItem item = items.get(index);
                int position = index + 1;
                runOnUiThread(() -> updateUploadProgress(position, items.size(), item.displayName));

                if (item.size > effectiveLimit) {
                    stagingStore.markFailed(item, "This file exceeds the host upload limit.");
                    failures += 1;
                    continue;
                }

                stagingStore.markUploading(item);
                TransferUploader.UploadResult result = TransferUploader.upload(
                        currentHost,
                        deviceId,
                        item
                );
                if (result.success) {
                    stagingStore.removeItem(item);
                    successes += 1;
                } else {
                    stagingStore.markFailed(item, result.message);
                    failures += 1;
                    if (result.status == 401) {
                        authExpired = true;
                    }
                }
            }

            int completedSuccesses = successes;
            int completedFailures = failures;
            boolean registrationExpired = authExpired;
            runOnUiThread(() -> {
                uploading = false;
                if (registrationExpired) {
                    preferences.edit().remove(deviceKey(currentHost)).apply();
                }
                showUploadResult(completedSuccesses, completedFailures, registrationExpired);
            });
        });
    }

    private void showUploadProgress(int count) {
        screen = Screen.UPLOADING;
        LinearLayout card = card();
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.addView(eyebrow("PUBLISHING TRANSFERS"));
        card.addView(title("Uploading files"));
        card.addView(paragraph(
                "Keep Drop Den open while files are published for everyone one at a time."
        ));

        ProgressBar indicator = new ProgressBar(this);
        indicator.setIndeterminate(false);
        indicator.setMax(count);
        indicator.setProgress(0);
        indicator.setTag("upload-progress");
        card.addView(indicator, matchWrap());

        TextView uploadStatus = text("Starting…", 13, MUTED);
        uploadStatus.setGravity(Gravity.CENTER);
        uploadStatus.setPadding(0, dp(12), 0, 0);
        uploadStatus.setTag("upload-status");
        card.addView(uploadStatus, matchWrap());
        setContentView(centeredPage(card));
    }

    private void updateUploadProgress(int position, int count, String filename) {
        View root = findViewById(android.R.id.content);
        ProgressBar uploadProgress = root.findViewWithTag("upload-progress");
        TextView uploadStatus = root.findViewWithTag("upload-status");
        if (uploadProgress != null) {
            uploadProgress.setProgress(position - 1);
        }
        if (uploadStatus != null) {
            uploadStatus.setText(position + " of " + count + " · " + filename);
        }
    }

    private void showUploadResult(int successes, int failures, boolean registrationExpired) {
        screen = Screen.RESULT;
        List<ShareStagingStore.SharedItem> remaining = stagingStore.loadItems();
        LinearLayout content = pageContent();
        content.addView(eyebrow("UPLOAD RESULT"));
        content.addView(title(
                failures == 0 ? "Transfers are available" : "Some files need attention"
        ));

        String summary;
        if (successes == 0 && failures == 0) {
            summary = "There are no files waiting to upload.";
        } else {
            summary = successes + " published · " + failures + " failed";
        }
        content.addView(paragraph(summary));

        if (!stageWarnings.isEmpty()) {
            StringBuilder warning = new StringBuilder();
            for (String value : stageWarnings) {
                if (warning.length() > 0) {
                    warning.append("\n");
                }
                warning.append("• ").append(value);
            }
            content.addView(infoBox("Some files were skipped", warning.toString(), true));
            stageWarnings.clear();
        }

        if (registrationExpired) {
            content.addView(infoBox(
                    "Registration expired",
                    "Join this den again before retrying the remaining files.",
                    true
            ));
        }

        for (ShareStagingStore.SharedItem item : remaining) {
            content.addView(sharedItemRow(item));
        }

        if (!remaining.isEmpty()) {
            Button retry = actionButton("Retry remaining files", true);
            retry.setOnClickListener(view -> retryPendingItems());
            content.addView(retry, buttonParams());

            Button changeHost = actionButton("Change host", false);
            changeHost.setOnClickListener(view -> {
                showConnectionScreen(true);
                hostInput.setText(currentHost);
            });
            content.addView(changeHost, buttonParams());
        }

        Button open = actionButton("Open Drop Den", remaining.isEmpty());
        open.setOnClickListener(view -> {
            shareFlowActive = false;
            openHost(currentHost, false);
        });
        content.addView(open, buttonParams());

        if (remaining.isEmpty()) {
            Button done = actionButton("Done", false);
            done.setOnClickListener(view -> finish());
            content.addView(done, buttonParams());
        }

        setContentView(scrollPage(content));
    }

    private void retryPendingItems() {
        String deviceId = preferences.getString(deviceKey(currentHost), "");
        if (isUuid(deviceId)) {
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

    private void showBusyScreen(String heading, String description) {
        screen = Screen.UPLOADING;
        LinearLayout card = card();
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.addView(title(heading));
        card.addView(paragraph(description));
        card.addView(new ProgressBar(this));
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

    private ScrollView scrollPage(View child) {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAGE);
        scroll.addView(child, matchWrap());
        return scroll;
    }

    private LinearLayout pageContent() {
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(20), dp(28), dp(20), dp(28));
        return content;
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

    private View infoBox(String label, String value, boolean warning) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(14), dp(12), dp(14), dp(12));
        box.setBackground(rounded(
                warning ? Color.rgb(255, 247, 237) : Color.WHITE,
                dp(14),
                warning ? Color.rgb(253, 186, 116) : BORDER
        ));
        box.addView(text(label.toUpperCase(Locale.ROOT), 11, warning ? ERROR : MUTED));
        TextView details = text(value, 13, warning ? ERROR : INK);
        details.setPadding(0, dp(5), 0, 0);
        box.addView(details, matchWrap());
        LinearLayout.LayoutParams params = matchWrap();
        params.setMargins(0, 0, 0, dp(12));
        box.setLayoutParams(params);
        return box;
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

    private LinearLayout.LayoutParams wrapWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
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

    private static String formatBytes(long bytes) {
        if (bytes < 1024L) {
            return bytes + " B";
        }
        double kib = bytes / 1024.0;
        if (kib < 1024.0) {
            return String.format(Locale.ROOT, "%.1f KiB", kib);
        }
        return String.format(Locale.ROOT, "%.1f MiB", kib / 1024.0);
    }

    private void destroyWebView() {
        cancelFileChooser();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
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
        UPLOADING,
        RESULT
    }
}
