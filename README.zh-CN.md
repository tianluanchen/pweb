# Pweb

[![TypeScriptVersion](https://img.shields.io/badge/TypeScript-v5-blue?logo=typescript&style=flat-square)](https://www.typescriptlang.org/)
[![NPM](https://img.shields.io/badge/NPM-gray?logo=NPM&style=flat-square)](https://www.npmjs.com/package/pweb)

快速对网站进行代理和修改，自带了命令行使用方式。

🚧 目前不支持代理`WebSocket`。

[English](./README.md) | 中文

## 安装

```bash
npm i pweb
```

## 命令行使用

```bash
# 全局安装
npm i pweb -g

# 监听127.0.0.1:3000并代理htttps://www.example.com
pweb -a 127.0.0.1:3000 https://www.example.com

# 为代理的网页注入hook代码，使得所有的XHR请求都会经过pweb启动的服务器
pweb --hook https://www.example.com

# 获取更多帮助
pweb --help
```

## 作为库使用

请参考`example`目录下的使用案例

## License

[MIT](./LICENSE) © Ayouth
