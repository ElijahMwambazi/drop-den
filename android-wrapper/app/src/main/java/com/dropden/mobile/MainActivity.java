package com.dropden.mobile;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String PREFERENCES = "drop_den_mobile";
    private static final String HOST_KEY = "host_url";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private EditText hostInput;
    private TextView status;
    private ProgressBar progress;
    private Button connectButton;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showConnectionScreen();

        String rememberedHost = getPreferences(MODE_PRIVATE).getString(HOST_KEY, "");
        hostInput.setText(rememberedHost);
        if (!rememberedHost.isEmpty()) {
            connect(rememberedHost);
        }
    }

    private void showConnectionScreen() {
        webView = null;

        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(24), dp(24), dp(24), dp(24));
        page.setBackgroundColor(Color.rgb(245, 245, 245));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(22), dp(24), dp(22), dp(24));
        card.setBackgroundColor(Color.WHITE);

        TextView eyebrow = text("LOCAL-ONLY TRANSFER HUB", 11, Color.DKGRAY);
        TextView title = text("Connect to Drop Den", 28, Color.rgb(20, 20, 20));
        title.setPadding(0, dp(8), 0, dp(8));
        TextView explanation = text(
                "Enter the address shown on the host device. This wrapper remembers the last working den.",
                14,
                Color.DKGRAY
        );
        explanation.setPadding(0, 0, 0, dp(18));

        hostInput = new EditText(this);
        hostInput.setSingleLine(true);
        hostInput.setHint("192.168.1.25:8080");
        hostInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT
                | android.text.InputType.TYPE_TEXT_VARIATION_URI);

        connectButton = new Button(this);
        connectButton.setText("Connect");
        connectButton.setOnClickListener(view -> connect(hostInput.getText().toString()));

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);

        status = text("", 13, Color.DKGRAY);
        status.setPadding(0, dp(10), 0, 0);

        card.addView(eyebrow);
        card.addView(title);
        card.addView(explanation);
        card.addView(hostInput, matchWrap());
        card.addView(connectButton, matchWrap());
        card.addView(progress, matchWrap());
        card.addView(status, matchWrap());
        page.addView(card, matchWrap());
        setContentView(page);
    }

    private void connect(String rawHost) {
        final String host;
        try {
            host = normalizeHost(rawHost);
        } catch (IllegalArgumentException error) {
            status.setText(error.getMessage());
            return;
        }

        setConnecting(true, "Checking host…");
        executor.execute(() -> {
            try {
                verifyHost(host);
                runOnUiThread(() -> {
                    getPreferences(MODE_PRIVATE).edit().putString(HOST_KEY, host).apply();
                    openHost(host);
                });
            } catch (Exception error) {
                runOnUiThread(() -> setConnecting(
                        false,
                        "Could not connect. Check the address and make sure the host is running."
                ));
            }
        });
    }

    private static String normalizeHost(String rawHost) {
        String value = rawHost.trim();
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
                    || uri.getUserInfo() != null) {
                throw new IllegalArgumentException();
            }
            int port = uri.getPort();
            return scheme + "://" + uri.getHost() + (port == -1 ? "" : ":" + port);
        } catch (Exception error) {
            throw new IllegalArgumentException("Use an HTTP or HTTPS host address.");
        }
    }

    private static void verifyHost(String host) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(host + "/api/config").openConnection();
        connection.setConnectTimeout(4_000);
        connection.setReadTimeout(4_000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Unexpected response");
            }
            BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream())
            );
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            reader.close();
            JSONObject config = new JSONObject(response.toString());
            if (!"Drop Den".equals(config.optString("app_name"))) {
                throw new IllegalStateException("Not a Drop Den host");
            }
        } finally {
            connection.disconnect();
        }
    }

    private void openHost(String host) {
        WebView view = new WebView(this);
        webView = view;
        view.setBackgroundColor(Color.WHITE);
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setDatabaseEnabled(true);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView webView, WebResourceRequest request) {
                Uri target = request.getUrl();
                Uri allowed = Uri.parse(host);
                boolean sameOrigin = target.getScheme().equals(allowed.getScheme())
                        && target.getHost().equals(allowed.getHost())
                        && target.getPort() == allowed.getPort();
                return !sameOrigin;
            }

            @Override
            public void onReceivedError(
                    WebView webView,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request.isForMainFrame()) {
                    showConnectionScreen();
                    hostInput.setText(host);
                    status.setText("The saved host is unavailable. Choose another address or retry.");
                }
            }
        });
        setContentView(view);
        view.loadUrl(host);
    }

    private void setConnecting(boolean connecting, String message) {
        connectButton.setEnabled(!connecting);
        progress.setVisibility(connecting ? View.VISIBLE : View.GONE);
        status.setText(message);
    }

    private TextView text(String value, int sp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        if (webView != null) {
            showConnectionScreen();
            hostInput.setText(getPreferences(MODE_PRIVATE).getString(HOST_KEY, ""));
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
