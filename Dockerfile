# depenomap を Docker で動かす（UT-20 / ADR-004）。
#
# Nix は開発環境の正、Docker は配布・実行の正として役割を分ける（ADR-005）。
# Node のバージョンだけ両方で揃える（`flake.nix` は Node 24）。
#
# **画面とサーバーは `pnpm build` の成果物をそのまま動かす。** ここで別の
# 組み立て方をすると、Docker でだけ違うものが動く経路ができる（UT-03 との
# 二重メンテを避ける）。

# --- 組み立て ---------------------------------------------------------------
FROM node:24-slim AS build

WORKDIR /app

# Git フックの仕込み（`prepare` スクリプト）は、組み立てにも実行にも要らない
ENV HUSKY=0

# 依存だけ先に入れる。ソースだけ変えたときに、この層を作り直さずに済む
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- 実行 -------------------------------------------------------------------
FROM node:24-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HUSKY=0

# 実行に要るのは成果物と、`dependencies` だけ。
#
# `dist/server/main.js` は依存をバンドルせずに import する（`hono` /
# `@hono/node-server` / `valibot`）。`--prod` は `dependencies` をまとめて
# 入れるので、画面側の依存（`vue` など。ビルド済みの `dist/client` に入って
# いるので実行には要らない）もここに含まれる。**サーバーの実行に要るものを
# ここで列挙し直さない** — `package.json` と二重に持つと、依存を足したときに
# 片方だけ古くなる。
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=build /app/dist ./dist

# 既定のポート（`config.ts` の DEFAULT_PORT と同じ）
EXPOSE 5173

# コンテナの外から届くようにする。
#
# `main.ts` はループバックだけで待ち受ける（この口には認証が無く、解析対象の
# 構成をそのまま返すため）。コンテナの中のループバックは外から届かないので、
# ここで明示的に開ける。**開けるのはコンテナの中だけ**で、ホスト側でどこに
# 見せるかは `docker run -p` が決める。
ENV DEPENOMAP_HOST=0.0.0.0

# root で待ち受けない。
#
# 解析対象リポジトリはマウントで渡す設計であり、`:ro` を付けるかは利用者が
# 決める。書き込める形で渡されたとき、root だとホスト側のリポジトリを
# 壊せてしまう。このサーバーは読むだけなので、node 公式イメージに元から
# いる一般ユーザーで足りる。
USER node

# 正本 JSON のパスは指定が要る（UT-03）。`--graph` か DEPENOMAP_GRAPH で渡す
ENTRYPOINT ["node", "dist/server/main.js"]
