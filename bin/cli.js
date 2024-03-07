#!/usr/bin/env node
import { program, InvalidArgumentError } from "commander";
import { ProxyWebsite } from "../lib/proxy-website.js";

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
    .version(ProxyWebsite.version)
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
  pweb --hook --path /__example__/  https://example.com
`
    )
    .action((url, options) => {
        const { port, hostname } = parseAddr(options.addr);
        const app = new ProxyWebsite({
            proxyUrl: options.proxyUrl || undefined,
            targetUrl: url,
            transferPrefix: options.path
        });
        if (options.hook) {
            app.useBrowserHook();
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
