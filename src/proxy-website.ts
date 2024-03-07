import httpProxy from "http-proxy";
import HttpsProxyAgent from "https-proxy-agent";
import HttpProxyAgent from "http-proxy-agent";
import http from "http";
import https from "https";
import zlib from "zlib";

type ProxyWebsiteOption = {
    targetUrl: string;
    proxyUrl?: string;
    /**
     * server url path for proxy, default `/__proxy__/`
     *
     * if visit `<url path>?url=<target>`, then return target response
     *
     * if set "", it will not proxy
     */
    serverProxyPath?: string;
};

type Listener = (
    buf: Buffer | null,
    proxyRes: http.IncomingMessage,
    req: http.IncomingMessage,
    res: http.ServerResponse<http.IncomingMessage>
) => Buffer | void;

/** 1:match  0:mismatch -1:discard */
type UrlMatcher = (url: URL) => 0 | 1 | -1;

class ProxyWebsite {
    readonly target: URL;
    private agents: {
        "http:": http.Agent;
        "https:": https.Agent;
    };
    static readonly version = "0.0.2";
    readonly serverProxyPath: string;
    readonly proxy: httpProxy;
    proxyErrorCallback: httpProxy.ErrorCallback;
    /** if `content-type` matched, the request body will be read into the buffer */
    contentTypeRegExp: RegExp = /(text|plain|json|xml|css|html|javascript|svg)/i;
    /** Listeners for each `content-type` */
    readonly listenerStorage: {
        contentType: RegExp | string;
        listener: Listener;
    }[];
    /** 1:match  0:mismatch -1:discard */
    serverUrlMatcher: UrlMatcher;
    /** 1:match  0:mismatch -1:discard */
    clientUrlMatcher: UrlMatcher;
    /** Save the actual target of each request and obtain the URL when needed through `requestMap. get (req)` */
    readonly requestMap: WeakMap<http.IncomingMessage, URL>;
    constructor(opt: ProxyWebsiteOption) {
        const { targetUrl, proxyUrl, serverProxyPath } = Object.assign(
            {
                serverProxyPath: "/__proxy__/"
            },
            opt
        );
        if (proxyUrl) {
            this.agents = {
                "http:": HttpProxyAgent(proxyUrl),
                "https:": HttpsProxyAgent(proxyUrl)
            };
        } else {
            this.agents = {
                "http:": new http.Agent(),
                "https:": new https.Agent()
            };
        }
        this.serverProxyPath = serverProxyPath;
        this.target = new URL(targetUrl);
        this.proxyErrorCallback = (err, req, res) => {
            if (res instanceof http.ServerResponse) {
                if (!res.writableEnded) {
                    if (!res.headersSent) {
                        res.writeHead(500);
                    }
                    res.end(`Internal Server Error`);
                }
            }
            console.log(`An error occured when proxy ${this.requestMap.get(req)?.href}`);
            console.log(err);
        };
        this.proxy = httpProxy.createProxyServer({});
        this.proxy.on("error", (...args) => this.proxyErrorCallback(...args));
        this.proxy.on("proxyRes", (proxyRes, req, res) => {
            const contentType = proxyRes.headers["content-type"]?.toLowerCase() || "";
            // filter matched listeners
            const matchedListeners: Listener[] = [];
            for (const item of this.listenerStorage) {
                if (
                    item.contentType instanceof RegExp
                        ? item.contentType.test(contentType)
                        : item.contentType === "*" || contentType.indexOf(item.contentType) > -1
                ) {
                    matchedListeners.push(item.listener);
                }
            }
            // return if no matched listeners
            if (matchedListeners.length <= 0) {
                // if not ended
                if (!res.writableEnded) {
                    !res.headersSent &&
                        res.writeHead(
                            proxyRes.statusCode || 200,
                            proxyRes.statusMessage,
                            proxyRes.headers
                        );
                    proxyRes.pipe(res);
                }
                return;
            }
            const contentEncoding = proxyRes.headers["content-encoding"]?.toLowerCase() || "";
            let buf: Buffer | null = null;
            const executeListeners = () => {
                for (const l of matchedListeners) {
                    // if ended then break
                    if (res.writableEnded) {
                        break;
                    }
                    // if return buffer then update
                    const r = l(buf, proxyRes, req, res);
                    if (r instanceof Buffer) {
                        buf = r;
                    }
                }
                // if not ended
                if (!res.writableEnded) {
                    !res.headersSent &&
                        res.writeHead(
                            proxyRes.statusCode || 200,
                            proxyRes.statusMessage,
                            proxyRes.headers
                        );
                    buf === null ? proxyRes.pipe(res) : res.end(buf);
                }
            };
            // auto decompress when matched content type
            if (this.contentTypeRegExp.test(contentType)) {
                const data: any[] = [];
                // delete headers about encoding
                delete proxyRes.headers["content-encoding"];
                delete proxyRes.headers["content-length"];
                // if not support the content encoding, run proxyErrorCallback and return
                if (
                    contentEncoding &&
                    contentEncoding !== "br" &&
                    contentEncoding !== "gzip" &&
                    contentEncoding !== "deflate"
                ) {
                    this.proxyErrorCallback(
                        new Error(`Unsupported content encoding "${contentEncoding}"`),
                        req,
                        res
                    );
                    return;
                }
                proxyRes
                    .on("data", (chunk) => {
                        data.push(chunk);
                    })
                    .on("end", () => {
                        const body = Buffer.concat(data);
                        let parsedBody: Buffer = body;
                        switch (contentEncoding) {
                            case "br":
                                parsedBody = zlib.brotliDecompressSync(body, {
                                    maxOutputLength: 1e9
                                });
                                break;
                            case "gzip":
                                parsedBody = zlib.unzipSync(body);
                                break;
                            case "deflate":
                                parsedBody = zlib.inflateSync(body);
                                break;
                        }
                        buf = parsedBody;
                        executeListeners();
                    });
            } else {
                executeListeners();
            }
        });
        this.clientUrlMatcher = this.serverUrlMatcher = () => 1;
        this.requestMap = new WeakMap();
        this.listenerStorage = [];
    }
    /**
     * the return value of UrlMatcher
     * 1:match  0:mismatch -1:discard
     */
    setServerUrlMatcher(m: UrlMatcher) {
        this.serverUrlMatcher = m;
        return this;
    }
    /**
     * client url matcher will be serialized using the `toString` method and insert into the HTML , please keep it pure
     *
     * the return value of UrlMatcher
     * 1:match  0:mismatch -1:discard
     */
    setClientUrlMatcher(m: UrlMatcher) {
        this.clientUrlMatcher = m;
        return this;
    }
    setErrorCallback(cb: httpProxy.ErrorCallback) {
        this.proxyErrorCallback = cb;
        return this;
    }
    /** if regexp match the target response content type, the  target response body will be decompressed and read into the buffer */
    setContentTypeRegExp(reg: RegExp) {
        this.contentTypeRegExp = reg;
        return this;
    }
    /**
     * Match the listener through the `content-type` response header
     * `*` matches all, `string` type matches using the `String.prototype.indexOf` method.
     *
     * if listener return buffer then update
     *
     * if res.WriteableEnded then break the loop call for the matched listener
     *
     * if the `buf` argument in the listener is not null, it indicates that the response body has been read into the `buf`
     */
    on(contentType: "*" | string | RegExp, listener: Listener) {
        this.listenerStorage.push({
            contentType,
            listener
        });
        return this;
    }
    /** transmit client request to target and transit target response to client */
    transmit(req: http.IncomingMessage, res: http.ServerResponse<http.IncomingMessage>) {
        let website = new URL(this.target.origin + req.url);
        // if need to proxy then get the real url
        if (this.serverProxyPath !== "" && website.pathname === this.serverProxyPath) {
            try {
                website = new URL(new URL(`http://${req.url ?? ""}`).searchParams.get("url"));
                // avoid loop
                if (website.pathname === this.serverProxyPath && website.searchParams.get("url")) {
                    throw new Error("loop proxy");
                }
                if (website.protocol !== "http:" && website.protocol !== "https:") {
                    throw new Error("invalid protocol " + website.protocol);
                }
                if (this.serverUrlMatcher(website) < 1) {
                    throw new Error("not matched url");
                }
                req.url = website.pathname + website.search;
            } catch {
                res.statusCode = 400;
                res.end("illegal url");
                return;
            }
        }
        this.requestMap.set(req, website);
        // change `accept-encoding`
        if (req.headers["accept-encoding"]) {
            req.headers["accept-encoding"] = "gzip, deflate, br";
        }
        this.proxy.web(req, res, {
            target: website.origin,
            agent: this.agents[website.protocol],
            headers: { host: website.host, referer: this.target.href },
            prependPath: false,
            xfwd: false,
            hostRewrite: website.host,
            protocolRewrite: website.protocol,
            selfHandleResponse: this.listenerStorage.length > 0,
            // don't proxy websocket
            ws: false
        });
        return this;
    }
    listen(
        port: number,
        hostname?: string,
        beforeTransmit?: http.RequestListener
    ): Promise<http.Server> {
        if (!beforeTransmit) {
            beforeTransmit = () => {};
        }
        const server = http.createServer((...args) => {
            beforeTransmit(...args);
            this.transmit(...args);
        });
        return new Promise((resolve) => {
            const cb = () => {
                resolve(server);
            };
            if (hostname === undefined) {
                server.listen(port, cb);
            } else {
                server.listen(port, hostname, cb);
            }
        });
    }
    /** Generate hook js that proxy browser-side requests. */
    generateHookJS() {
        return `
        ((window) => {
            if (window['${this.serverProxyPath}fetch'] || window.XMLHttpRequest.prototype['${
                this.serverProxyPath
            }open']) {
                return;
            }
            const urlMatcher = ${this.clientUrlMatcher.toString()};
            const urlReplacer = (url => ("${
                this.serverProxyPath
            }?url="+ encodeURIComponent(url.protocol + url.host + url.pathname + url.search)));
            const getValidUrl = (url) => {
                if (url instanceof URL === false) {
                    try {
                        url = new URL(url);
                        // same origin
                        if(url.origin===window.location.origin){
                            return url;
                        }
                    } catch {
                        return url;
                    }
                }
                const r = window['${this.serverProxyPath}'].urlMatcher(url);
                if (r >= 0) {
                    return url = r === 1 ? window['${
                        this.serverProxyPath
                    }'].urlReplacer(url) : url.href;
                } else {
                    return null;
                }
            };
            window['${this.serverProxyPath}'] = {
                urlMatcher,
                urlReplacer,
                getValidUrl,
            };
            window['${this.serverProxyPath}fetch'] = fetch;
            window.fetch = (...args) => {
                let url = window['${this.serverProxyPath}'].getValidUrl(args[0]);
                if (url === null) {
                    return new Promise(() => { });
                }
                args[0] = url;
                return window['${this.serverProxyPath}fetch'](...args);
            }
            window.XMLHttpRequest.prototype['${
                this.serverProxyPath
            }open'] = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function (...args) {
                let url = args[1];
                url = window['${this.serverProxyPath}'].getValidUrl(url);
                if (url === null) {
                    this.send=() => { };
                    return;
                }
                args[1] = url;
                this['${this.serverProxyPath}open'](...args);
            }
        })(window);
        `;
    }
    /** inject hook codes in html to proxy browser side requests*/
    useBrowserHook() {
        this.useBrowserHook = () => this;
        return this.on("html", (buf, proxyRes, req, res) => {
            if (buf !== null) {
                return Buffer.concat([
                    Buffer.from(`<script>${this.generateHookJS()}</script>`),
                    buf
                ]);
            }
        });
    }
}

export { ProxyWebsite };

type htmlMethod = {
    html: () => string;
};
type JSGenerator = {
    write: (s: string) => JSGenerator;
} & htmlMethod;

type CSSGenerator = {
    write(s: string): CSSGenerator;
    write(sel: string, obj: Record<string, string | number>, important?: boolean): CSSGenerator;
    hide(this: CSSGenerator, sel: string): CSSGenerator;
} & htmlMethod;

export function js(opt?: { module?: boolean; iife?: boolean }): JSGenerator {
    const { module, iife } = opt || {};
    const iifeWrapper = (s: string) => (iife ? `((window)=>{\n${s}\n})(window);` : s);
    let codes = "";
    return {
        write(s: string) {
            codes += s;
            return this;
        },
        html() {
            return `<script${module ? ' type="module" ' : ""}>${iifeWrapper(codes)}</script>`;
        }
    };
}

export function css(): CSSGenerator {
    let codes = "";
    return {
        hide(sel: string) {
            return this.write(
                sel,
                {
                    opacity: 0,
                    display: "none",
                    height: "0px",
                    width: "0px"
                },
                true
            );
        },
        write(...args: any[]) {
            if (args.length <= 1) {
                codes += args[0] as string;
            } else {
                codes += `\n${args[0]}{${Object.entries(args[1]).reduce((p, [k, v]) => {
                    return (p += `${k}:${v}${args[2] ? " !important" : ""};`);
                }, "")}}\n`;
            }
            return this;
        },
        html() {
            return `<style>${codes}</style>`;
        }
    };
}
