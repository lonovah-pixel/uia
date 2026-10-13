package app.uia.taxi;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Оболочка приложения: WebView с собранным фронтендом из assets/www.
 *
 * Файлы отдаются с адреса https://appassets.androidplatform.net/ — это настоящий https-источник,
 * поэтому в WebView работают геолокация и localStorage. Ссылки на другие сайты и приложения
 * (заказ в Яндекс Go, Uber и т. д.) открываются снаружи. Для API агрегаторов есть нативный
 * HTTP-мост (window.UiaNative): без ограничений CORS и только к разрешённым адресам.
 */
public class MainActivity extends Activity {

    private static final String TAG = "UiaTaxi";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/index.html";
    private static final int REQUEST_LOCATION = 1;
    private static final int HTTP_TIMEOUT_MS = 8000;

    /** Куда веб-приложению разрешено ходить через нативный мост. */
    private static final Set<String> ALLOWED_HOSTS = new HashSet<>(Arrays.asList(
            "router.project-osrm.org",
            "photon.komoot.io",
            "taxi-routeinfo.taxi.yandex.net",
            "api.uber.com"));

    private static final Map<String, String> MIME_TYPES = new HashMap<>();

    static {
        MIME_TYPES.put("html", "text/html");
        MIME_TYPES.put("js", "text/javascript");
        MIME_TYPES.put("mjs", "text/javascript");
        MIME_TYPES.put("css", "text/css");
        MIME_TYPES.put("json", "application/json");
        MIME_TYPES.put("webmanifest", "application/manifest+json");
        MIME_TYPES.put("svg", "image/svg+xml");
        MIME_TYPES.put("png", "image/png");
        MIME_TYPES.put("jpg", "image/jpeg");
        MIME_TYPES.put("jpeg", "image/jpeg");
        MIME_TYPES.put("webp", "image/webp");
        MIME_TYPES.put("ico", "image/x-icon");
        MIME_TYPES.put("woff", "font/woff");
        MIME_TYPES.put("woff2", "font/woff2");
        MIME_TYPES.put("txt", "text/plain");
    }

    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private WebView webView;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private String pendingGeoOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(getColor(R.color.background));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Правила OpenStreetMap и Photon требуют, чтобы приложение представлялось
        settings.setUserAgentString(settings.getUserAgentString() + " UiaTaxi/" + versionName());

        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());
        webView.addJavascriptInterface(new NativeBridge(), "UiaNative");

        setContentView(webView);

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /** «Назад» сначала получает веб-приложение (например, чтобы закрыть настройки). */
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(
                "(function(){return !!(window.__uiaBack && window.__uiaBack());})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String handled) {
                        if ("true".equals(handled)) return;
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            MainActivity.super.onBackPressed();
                        }
                    }
                });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQUEST_LOCATION || pendingGeoCallback == null) return;
        boolean granted = false;
        for (int result : grantResults) {
            granted |= result == PackageManager.PERMISSION_GRANTED;
        }
        pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
        pendingGeoCallback = null;
        pendingGeoOrigin = null;
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void openExternal(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_app, Toast.LENGTH_SHORT).show();
        }
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "0";
        }
    }

    // ——— Раздача фронтенда из assets/www ———

    private WebResourceResponse serveAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        if (path.contains("..")) return emptyResponse(403, "Forbidden");
        try {
            return assetResponse(path, getAssets().open("www" + path));
        } catch (IOException notFound) {
            // Одностраничное приложение: адреса без расширения файла отдают index.html
            String name = path.substring(path.lastIndexOf('/') + 1);
            if (!name.contains(".")) {
                try {
                    return assetResponse("/index.html", getAssets().open("www/index.html"));
                } catch (IOException ignored) {
                    // нет и index.html — сборка повреждена
                }
            }
            return emptyResponse(404, "Not Found");
        }
    }

    private static WebResourceResponse assetResponse(String path, InputStream data) {
        String extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
        String mime = MIME_TYPES.containsKey(extension) ? MIME_TYPES.get(extension) : "application/octet-stream";
        boolean text = mime.startsWith("text/") || mime.contains("json") || mime.contains("svg");
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        return new WebResourceResponse(mime, text ? "UTF-8" : null, 200, "OK", headers, data);
    }

    private static WebResourceResponse emptyResponse(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason,
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private final class AppWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (ASSET_HOST.equals(uri.getHost())) return serveAsset(uri);
            return null; // карта, маршрут, адреса — из сети как обычно
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (ASSET_HOST.equals(uri.getHost())) return false;
            openExternal(uri);
            return true;
        }
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            if (hasLocationPermission()) {
                callback.invoke(origin, true, false);
                return;
            }
            pendingGeoOrigin = origin;
            pendingGeoCallback = callback;
            requestPermissions(new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
            }, REQUEST_LOCATION);
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            Log.d(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
            return true;
        }
    }

    // ——— Нативные HTTP-запросы для веб-приложения ———

    private final class NativeBridge {
        /** Ответ приходит в window.__uiaNativeResponse(id, status, body); status 0 — сетевая ошибка. */
        @JavascriptInterface
        public void request(final String id, final String url, final String headersJson) {
            executor.execute(new Runnable() {
                @Override
                public void run() {
                    int status;
                    String body;
                    try {
                        HttpURLConnection connection = open(url, headersJson);
                        try {
                            status = connection.getResponseCode();
                            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                            body = stream == null ? "" : readAll(stream);
                        } finally {
                            connection.disconnect();
                        }
                    } catch (Exception e) {
                        status = 0;
                        body = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    }
                    deliver(id, status, body);
                }
            });
        }
    }

    private static HttpURLConnection open(String url, String headersJson) throws Exception {
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) || !ALLOWED_HOSTS.contains(uri.getHost())) {
            throw new SecurityException("Адрес не разрешён: " + uri.getHost());
        }
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(HTTP_TIMEOUT_MS);
        connection.setReadTimeout(HTTP_TIMEOUT_MS);
        connection.setRequestMethod("GET");
        JSONObject headers = new JSONObject(headersJson == null || headersJson.isEmpty() ? "{}" : headersJson);
        Iterator<String> names = headers.keys();
        while (names.hasNext()) {
            String name = names.next();
            connection.setRequestProperty(name, headers.optString(name));
        }
        return connection;
    }

    private static String readAll(InputStream stream) throws IOException {
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void deliver(String id, int status, String body) {
        final String script = "window.__uiaNativeResponse&&window.__uiaNativeResponse("
                + JSONObject.quote(id) + "," + status + "," + JSONObject.quote(body) + ")";
        final WebView view = webView;
        if (view == null) return;
        view.post(new Runnable() {
            @Override
            public void run() {
                if (webView != null) webView.evaluateJavascript(script, null);
            }
        });
    }
}
