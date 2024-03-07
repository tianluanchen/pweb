// you should import from "pweb"
// import { ProxyWebsite, css, js } from "pweb";
import { ProxyWebsite, css, js } from "../lib/proxy-website.js";
const app = new ProxyWebsite({
    targetUrl: "https://www.example.com",
    /**
     * server url path for proxy, default `/__proxy__/`
     *
     * if visit `<url path>?url=<target>`, then return target response
     *
     * if set "", it will not proxy
     */
    serverProxyPath: "/__example__/"
    // fetch target response via proxy
    // proxyUrl: "http://127.0.0.1:8080"
});

console.log("Version:", ProxyWebsite.version);
const hostname = "127.0.0.1";
const port = 3000;

// inject hook codes for the proxied webpage, so all XHR requests will go through the server started by pweb
app.useBrowserHook();

// default client url matcher is ()=>1
app.setClientUrlMatcher((url) => {
    // 1:match 0:mismatch -1:discard
    // if -1, the request won't be sent
    return 1;
});
// default client url matcher is ()=>1
app.setServerUrlMatcher((url) => {
    // 1:match 0:mismatch -1:discard
    return 1;
});

/** if regexp match the target response content type, the  target response body will be decompressed and read into the buffer */
// default /(text|plain|json|xml|css|html|javascript|svg)/i
app.setContentTypeRegExp(/(text|plain|json|xml|css|html|javascript|svg)/i);
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
app.on("*", (buf, proxyRes, req, res) => {
    // you could get target url via app.requestMap
    const targetUrl = app.requestMap.get(req);
    // print log
    console.log(
        `${new Date().toLocaleString()}  ${req.method}  ${req.url}  ${
            req.headers.referer || "-"
        }  ${targetUrl?.href || "-"}`
    );
}).on("html", (buf) => {
    // change content
    return Buffer.concat([
        Buffer.from(
            // css() and js() are helper functions to generate css and js html
            css().write("body", { background: "pink" }, true).html() +
                js()
                    .write(
                        "window.addEventListener('load',()=>setTimeout(()=>alert('Now the background is pink!'),500))"
                    )
                    .html()
        ),
        buf
    ]);
});
// a quick way to start http server
app.listen(port, hostname, (req, res) => {
    // do anything before app handle the request
    // ...
}).then(() => {
    console.log(`Server is listening at ${hostname}:${port}`);
});

// you could also use app.transmit
// app.transmit(req, res);
