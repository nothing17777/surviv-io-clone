// Routes every game WebSocket through one port so the game server can sit
// behind a single tunnel / domain: wss://host/play/9001 -> 127.0.0.1:9001/play
import http from "node:http";
import net from "node:net";

const listenPort = Number(process.env.GAME_PROXY_PORT || 8002);

// The API also calls the game server over plain HTTP at this address,
// so anything that isn't a game WebSocket goes to the main game server port.
const mainPort = Number(process.env.GAME_SERVER_PORT || 8001);

const server = http.createServer((req, res) => {
    const upstream = http.request(
        { host: "127.0.0.1", port: mainPort, path: req.url, method: req.method, headers: req.headers },
        (upRes) => {
            res.writeHead(upRes.statusCode || 502, upRes.headers);
            upRes.pipe(res);
        },
    );
    upstream.on("error", () => {
        // the reply may already be streaming, so only send a 502 if it hasn't started
        if (!res.headersSent) res.writeHead(502);
        res.end();
    });
    req.on("error", () => upstream.destroy());
    res.on("error", () => upstream.destroy());
    req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
    const match = /^\/play\/(\d{4,5})(\?.*)?$/.exec(req.url || "");
    const port = match && Number(match[1]);
    if (!port || port < 9000 || port > 9999) {
        socket.destroy();
        return;
    }

    const upstream = net.connect(port, "127.0.0.1", () => {
        const headers = Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join("\r\n");
        upstream.write(`GET /play${match[2] || ""} HTTP/1.1\r\n${headers}\r\n\r\n`);
        if (head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
});

// one bad connection must never take the whole proxy down
process.on("uncaughtException", (err) => {
    console.error("game proxy error:", err);
});

server.listen(listenPort, "127.0.0.1", () => {
    console.log(`game proxy listening on ${listenPort}`);
});
