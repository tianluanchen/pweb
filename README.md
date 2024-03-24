# Pweb

[![TypeScriptVersion](https://img.shields.io/badge/TypeScript-v5-blue?logo=typescript&style=flat-square)](https://www.typescriptlang.org/)
[![NPM](https://img.shields.io/badge/NPM-gray?logo=NPM&style=flat-square)](https://www.npmjs.com/package/pweb)

Quickly proxy and modify websites, with built-in command-line usage.

🚧 Currently does not support proxying `WebSocket`.

English | [中文](./README.zh-CN.md)

## Installation

```bash
npm i pweb
```

## Command Line Usage

```bash
# Global installation
npm i pweb -g

# Listen 127.0.0.1:3000 and proxy htttps://www.example.com
pweb -a 127.0.0.1:3000 https://www.example.com

# Inject hook code for the proxied webpage, so all XHR requests will go through the server started by pweb
pweb --hook https://www.example.com

# Inject CSS and JS code for the proxied webpage
pweb --css "body{background:pink !important;}" --js "window.onload=()=>alert('Now the background is pink!')"  https://www.example.com

# Get more help
pweb --help
```

## Using as a Library

Please refer to the usage examples in the `example` directory.

## License

[MIT](./LICENSE) © Ayouth
