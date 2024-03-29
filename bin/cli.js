#!/usr/bin/env node
import { program, InvalidArgumentError } from "commander";
import { ProxyWebsite, css, js } from "../lib/proxy-website.js";
import { createRequire } from "module";
const { version } = createRequire(import.meta.url)("../package.json");
/**
 * @param {string} v
 * @returns {{port: number, hostname?: string}}
 */
const parseAddr = (v) => {
    const s = v.split(":");
    const group = {
        port: parseInt(s.slice(-1)),
        hostname: s.slice(0, -1).join(":")
    };
    if (isNaN(group.port)) {
        throw "Invalid port";
    }
    if (group.hostname === "") {
        return group;
    }
    try {
        const url = new URL("http://" + group.hostname);
        group.hostname = url.hostname.replace(/^\[|\]$/g, "");
    } catch (error) {
        throw "Invalid address";
    }
    return group;
};

program
    .name("pweb")
    .description("Quickly proxy a website")
    .version(version)
    .option(
        "-a, --addr <address>",
        "listen address",
        (v) => {
            try {
                parseAddr(v);
            } catch (error) {
                throw new InvalidArgumentError(error?.message || String(error));
            }
            return v;
        },
        "127.0.0.1:3000"
    )
    .option("--path <string>", "set transfer prefix", "/__proxy__/")
    .option("--proxy <url>", "proxy url", (v) => {
        try {
            const url = new URL(v);
            if (url.protocol !== "http:" && url.protocol !== "https:") {
                throw "Unsupport protocol " + url.protocol;
            }
        } catch (error) {
            throw new InvalidArgumentError(error?.message || String(error));
        }
        return v;
    })
    .option("--hook", "proxy browser side xhr requests", false)
    .option("--css <string>", "inject css to HTML")
    .option("--js <string>", "inject javascript to HTML")
    .argument("<url>", "url to proxy", (v) => {
        try {
            const u = new URL(v);
            return u.protocol + "//" + u.host;
        } catch (error) {
            throw new InvalidArgumentError(error?.message || String(error));
        }
    })
    .addHelpText(
        "after",
        `
Examples:
  pweb -a 127.0.0.1:3000  https://example.com
  pweb --hook  https://example.com
  pweb --proxy http://127.0.0.1:8080 https://example.com
  pweb --css "body{background:pink !important;}" --js "window.onload=()=>alert('Now the background is pink!')"  https://www.example.com
`
    )
    .action((url, options) => {
        const { port, hostname } = parseAddr(options.addr);
        const app = new ProxyWebsite({
            proxyUrl: options.proxy,
            targetUrl: url,
            transferPrefix: options.path
        });
        if (options.hook) {
            app.useBrowserHook();
        }
        if (options.css || options.js) {
            app.on("html", (buf) => {
                if (buf) {
                    return Buffer.concat([
                        Buffer.from(
                            css()
                                .write(options.css || "")
                                .html() +
                                js()
                                    .write(options.js || "")
                                    .html()
                        ),
                        buf
                    ]);
                }
            });
        }
        app.on("*", (buf, proxyRes, req, res) => {
            console.log(
                `${new Date().toLocaleString()}  ${req.method}  ${req.url}  ${
                    req.headers.referer || "-"
                }  ${app.requestMap.get(req)?.href || "-"}`
            );
        })
            .listen(port, hostname)
            .then(() => {
                console.log(`Server is listening at ${options.addr}`);
                console.log("Log Format: <date>  <method>  <path>  <referrer>  <real request url>");
            });
    });
program.parse();
