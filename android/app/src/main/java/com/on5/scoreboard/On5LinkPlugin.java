package com.on5.scoreboard;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;
import android.app.Activity;
import android.view.WindowManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * ON5 cihazları arası bağlantı (aynı Wi-Fi, internet gerekmez).
 * Ana cihaz bir TCP sunucusu açar ve ağda "_on5link._tcp" olarak kendini duyurur (NSD/mDNS).
 * Diğer cihazlar onu bulup bağlanır. Mesajlar satır satır JSON metnidir.
 * Ana cihaz bir istemciden gelen mesajı diğer istemcilere de iletir (3+ cihaz).
 */
@CapacitorPlugin(name = "On5Link")
public class On5LinkPlugin extends Plugin {
    private static final String SERVICE_TYPE = "_on5link._tcp.";
    private static final int PORT = 47575;
    private static final int READ_TIMEOUT_MS = 15000; // JS her 4 sn'de ping atar; 15 sn ses yoksa bağlantı ölü sayılır

    private ServerSocket server;
    private final List<Peer> peers = new CopyOnWriteArrayList<>();
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ExecutorService writer = Executors.newSingleThreadExecutor(); // gönderim sırası korunsun

    private volatile String hostName = "Racko";
    private NsdManager nsd;
    private NsdManager.RegistrationListener regListener;
    private NsdManager.DiscoveryListener discListener;
    private WifiManager.MulticastLock multicastLock;
    private final ConcurrentLinkedQueue<NsdServiceInfo> resolveQueue = new ConcurrentLinkedQueue<>();
    private volatile boolean resolving = false;

    private class Peer {
        final Socket socket;
        final BufferedWriter out;
        final String addr;
        final boolean incoming; // bu cihaz ana cihazken bağlanan istemci

        Peer(Socket s, boolean incoming) throws IOException {
            this.socket = s;
            this.incoming = incoming;
            this.addr = s.getInetAddress().getHostAddress();
            this.out = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8));
        }

        synchronized void send(String line) {
            try {
                out.write(line);
                out.write('\n');
                out.flush();
            } catch (IOException e) {
                close();
            }
        }

        void close() {
            try { socket.close(); } catch (IOException ignored) {}
        }
    }

    @Override
    public void load() {
        nsd = (NsdManager) getContext().getSystemService(Context.NSD_SERVICE);
    }

    // ---- Ana cihaz ----

    @PluginMethod
    public void host(PluginCall call) {
        final String name = call.getString("name", "ON5");
        hostName = name;
        io.execute(() -> {
            try {
                if (server == null || server.isClosed()) {
                    ServerSocket srv = new ServerSocket();
                    srv.setReuseAddress(true);
                    try {
                        srv.bind(new InetSocketAddress(PORT));
                    } catch (IOException busy) {
                        srv.close();
                        srv = new ServerSocket(0); // sabit port doluysa rastgele port
                    }
                    server = srv;
                    final ServerSocket accepting = srv;
                    io.execute(() -> {
                        while (!accepting.isClosed()) {
                            try {
                                attach(accepting.accept(), true);
                            } catch (IOException e) {
                                break;
                            }
                        }
                    });
                    registerService(name, srv.getLocalPort());
                }
                JSObject r = new JSObject();
                r.put("port", server.getLocalPort());
                r.put("ip", localIp());
                call.resolve(r);
            } catch (IOException e) {
                call.reject("Sunucu açılamadı: " + e.getMessage());
            }
        });
    }

    private void registerService(String name, int port) {
        if (nsd == null) return;
        unregisterService();
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(name);
        info.setServiceType(SERVICE_TYPE);
        info.setPort(port);
        regListener = new NsdManager.RegistrationListener() {
            @Override public void onServiceRegistered(NsdServiceInfo i) {}
            @Override public void onRegistrationFailed(NsdServiceInfo i, int code) {}
            @Override public void onServiceUnregistered(NsdServiceInfo i) {}
            @Override public void onUnregistrationFailed(NsdServiceInfo i, int code) {}
        };
        try {
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, regListener);
        } catch (Exception ignored) {
            regListener = null;
        }
    }

    private void unregisterService() {
        if (nsd != null && regListener != null) {
            try { nsd.unregisterService(regListener); } catch (Exception ignored) {}
        }
        regListener = null;
    }

    // ---- İstemci ----

    @PluginMethod
    public void connect(PluginCall call) {
        final String host = call.getString("host");
        final int port = call.getInt("port", PORT);
        if (host == null || host.isEmpty()) {
            call.reject("Adres yok");
            return;
        }
        io.execute(() -> {
            try {
                Socket s = new Socket();
                s.connect(new InetSocketAddress(host, port), 4000);
                attach(s, false);
                call.resolve();
            } catch (IOException e) {
                call.reject("Bağlanılamadı: " + e.getMessage());
            }
        });
    }

    // ---- Ortak ----

    private void attach(Socket s, boolean incoming) throws IOException {
        s.setTcpNoDelay(true);
        s.setKeepAlive(true);
        s.setSoTimeout(READ_TIMEOUT_MS);
        final Peer p = new Peer(s, incoming);
        final boolean[] joined = { !incoming };
        if (!incoming) {
            peers.add(p);
            notifyPeer("join", p);
        }
        io.execute(() -> {
            try (BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = in.readLine()) != null) {
                    if (!joined[0]) {
                        if (line.equals("PROBE")) {
                            // Ağ taraması: adımızı söyle, kapat
                            JSObject hi = new JSObject();
                            hi.put("t", "hi");
                            hi.put("name", hostName);
                            p.send(hi.toString());
                            break;
                        }
                        joined[0] = true;
                        peers.add(p);
                        notifyPeer("join", p);
                    }
                    if (incoming) {
                        final String relay = line;
                        writer.execute(() -> {
                            for (Peer o : peers) if (o != p && o.incoming) o.send(relay);
                        });
                    }
                    JSObject ev = new JSObject();
                    ev.put("data", line);
                    ev.put("from", p.addr);
                    notifyListeners("message", ev);
                }
            } catch (IOException ignored) {
            }
            p.close();
            if (joined[0]) {
                peers.remove(p);
                notifyPeer("leave", p);
            }
        });
    }

    private void notifyPeer(String event, Peer p) {
        JSObject ev = new JSObject();
        ev.put("event", event);
        ev.put("addr", p.addr);
        ev.put("incoming", p.incoming);
        ev.put("count", peers.size());
        notifyListeners("peer", ev);
    }

    @PluginMethod
    public void send(PluginCall call) {
        final String data = call.getString("data");
        if (data == null) {
            call.reject("Veri yok");
            return;
        }
        final String line = data.replace("\n", " ");
        writer.execute(() -> {
            for (Peer p : peers) p.send(line);
        });
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("hosting", server != null && !server.isClosed());
        r.put("port", server != null && !server.isClosed() ? server.getLocalPort() : 0);
        r.put("ip", localIp());
        r.put("count", peers.size());
        call.resolve(r);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        shutdown();
        call.resolve();
    }

    private void shutdown() {
        unregisterService();
        if (server != null) {
            try { server.close(); } catch (IOException ignored) {}
            server = null;
        }
        for (Peer p : peers) p.close();
        peers.clear();
        stopDiscoveryInternal();
    }

    // ---- Ağı tara: aynı alt ağdaki her adrese bağlanmayı dene (mDNS çalışmayan modemler için)
    @PluginMethod
    public void scan(PluginCall call) {
        final int port = call.getInt("port", PORT);
        final String me = localIp();
        if (me.isEmpty()) {
            call.reject("Wi-Fi yok");
            return;
        }
        final String base = me.substring(0, me.lastIndexOf('.') + 1);
        io.execute(() -> {
            ExecutorService pool = Executors.newFixedThreadPool(48);
            final AtomicInteger hits = new AtomicInteger();
            for (int i = 1; i < 255; i++) {
                final String ip = base + i;
                if (ip.equals(me)) continue;
                pool.execute(() -> {
                    try (Socket s = new Socket()) {
                        s.connect(new InetSocketAddress(ip, port), 400);
                        s.setSoTimeout(1200);
                        BufferedWriter w = new BufferedWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8));
                        w.write("PROBE\n");
                        w.flush();
                        String name = ip;
                        try {
                            String l = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8)).readLine();
                            if (l != null) name = new JSONObject(l).optString("name", ip);
                        } catch (Exception ignored) {}
                        JSObject ev = new JSObject();
                        ev.put("name", name);
                        ev.put("host", ip);
                        ev.put("port", port);
                        ev.put("scan", true);
                        notifyListeners("found", ev);
                        hits.incrementAndGet();
                    } catch (Exception ignored) {}
                });
            }
            pool.shutdown();
            try { pool.awaitTermination(15, TimeUnit.SECONDS); } catch (InterruptedException ignored) {}
            JSObject r = new JSObject();
            r.put("found", hits.get());
            r.put("ip", me);
            call.resolve(r);
        });
    }

    // ---- Güncelleme: sürüm bilgisi, APK indir ve kurulum ekranını aç
    @PluginMethod
    public void appInfo(PluginCall call) {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject r = new JSObject();
            r.put("version", pi.versionName);
            r.put("code", Build.VERSION.SDK_INT >= 28 ? (int) pi.getLongVersionCode() : pi.versionCode);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        final String url = call.getString("url");
        if (url == null) { call.reject("Adres yok"); return; }
        io.execute(() -> {
            File f = new File(getContext().getCacheDir(), "Racko-update.apk");
            try {
                String u = url;
                HttpURLConnection c = null;
                for (int i = 0; i < 6; i++) { // GitHub başka sunucuya yönlendirir
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(30000);
                    c.setRequestProperty("User-Agent", "Racko");
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) { u = new URL(new URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
                    if (code != 200) throw new IOException("HTTP " + code);
                    break;
                }
                long total = c.getContentLengthLong(), done = 0, lastSent = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        if (done - lastSent > 300000) {
                            lastSent = done;
                            JSObject ev = new JSObject();
                            ev.put("done", done);
                            ev.put("total", total);
                            notifyListeners("updateProgress", ev);
                        }
                    }
                }
                c.disconnect();
                final Activity a = getActivity();
                // Android 8+: "bilinmeyen uygulamaları yükle" izni yoksa ayara götür
                if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
                    Intent s = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName()));
                    s.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    a.startActivity(s);
                    JSObject r = new JSObject();
                    r.put("needPermission", true);
                    call.resolve(r);
                    return;
                }
                Uri uri = FileProvider.getUriForFile(a, a.getPackageName() + ".fileprovider", f);
                Intent it = new Intent(Intent.ACTION_VIEW);
                it.setDataAndType(uri, "application/vnd.android.package-archive");
                it.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                a.startActivity(it);
                call.resolve(new JSObject());
            } catch (Exception e) {
                call.reject("İndirilemedi: " + e.getMessage());
            }
        });
    }

    // ---- Kamera telefonu kilidi: uygulamayı sabitle (başka uygulamaya geçilmesin), ekranı karart
    @PluginMethod
    public void lockTask(PluginCall call) {
        final boolean on = call.getBoolean("on", false);
        final Activity a = getActivity();
        a.runOnUiThread(() -> {
            try {
                if (on) a.startLockTask(); else a.stopLockTask();
            } catch (Exception ignored) {}
            call.resolve();
        });
    }

    @PluginMethod
    public void dim(PluginCall call) {
        final double level = call.getDouble("level", -1.0);
        final Activity a = getActivity();
        a.runOnUiThread(() -> {
            WindowManager.LayoutParams lp = a.getWindow().getAttributes();
            lp.screenBrightness = level < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : (float) level;
            a.getWindow().setAttributes(lp);
            call.resolve();
        });
    }

    // ---- Ağda ana cihaz arama ----

    @PluginMethod
    public void startDiscovery(PluginCall call) {
        if (nsd == null) {
            call.reject("NSD yok");
            return;
        }
        stopDiscoveryInternal();
        try {
            WifiManager wifi = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifi != null) {
                multicastLock = wifi.createMulticastLock("on5link");
                multicastLock.setReferenceCounted(false);
                multicastLock.acquire();
            }
        } catch (Exception ignored) {}
        discListener = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String t) {}
            @Override public void onDiscoveryStopped(String t) {}
            @Override public void onStartDiscoveryFailed(String t, int code) {}
            @Override public void onStopDiscoveryFailed(String t, int code) {}

            @Override
            public void onServiceFound(NsdServiceInfo info) {
                resolveQueue.add(info);
                resolveNext();
            }

            @Override
            public void onServiceLost(NsdServiceInfo info) {
                JSObject ev = new JSObject();
                ev.put("name", info.getServiceName());
                notifyListeners("lost", ev);
            }
        };
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, discListener);
            call.resolve();
        } catch (Exception e) {
            discListener = null;
            call.reject("Arama başlatılamadı: " + e.getMessage());
        }
    }

    // Eski Android sürümlerinde aynı anda tek çözümleme yapılabiliyor: sırayla
    private synchronized void resolveNext() {
        if (resolving) return;
        final NsdServiceInfo next = resolveQueue.poll();
        if (next == null) return;
        resolving = true;
        try {
            nsd.resolveService(next, new NsdManager.ResolveListener() {
                @Override
                public void onResolveFailed(NsdServiceInfo i, int code) {
                    resolving = false;
                    resolveNext();
                }

                @Override
                public void onServiceResolved(NsdServiceInfo i) {
                    InetAddress h = i.getHost();
                    if (h != null) {
                        JSObject ev = new JSObject();
                        ev.put("name", i.getServiceName());
                        ev.put("host", h.getHostAddress());
                        ev.put("port", i.getPort());
                        notifyListeners("found", ev);
                    }
                    resolving = false;
                    resolveNext();
                }
            });
        } catch (Exception e) {
            resolving = false;
        }
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        stopDiscoveryInternal();
        call.resolve();
    }

    private void stopDiscoveryInternal() {
        if (nsd != null && discListener != null) {
            try { nsd.stopServiceDiscovery(discListener); } catch (Exception ignored) {}
        }
        discListener = null;
        resolveQueue.clear();
        resolving = false;
        if (multicastLock != null) {
            try { if (multicastLock.isHeld()) multicastLock.release(); } catch (Exception ignored) {}
            multicastLock = null;
        }
    }

    private static String localIp() {
        String fallback = "";
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) {
                        String ip = a.getHostAddress();
                        if (ni.getName().startsWith("wlan")) return ip;
                        if (fallback.isEmpty()) fallback = ip;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    @Override
    protected void handleOnDestroy() {
        shutdown();
        io.shutdownNow();
        writer.shutdownNow();
    }
}
