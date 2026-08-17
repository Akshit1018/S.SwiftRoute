# SwiftRoute — Open Source Last-Mile Logistics Control Room

**SwiftRoute Control** is an open-source **last-mile ops dashboard** for Indian logistics. Dirty warehouse CSVs, flaky tracking APIs, and driver events go through quality gates into one gold layer leadership can quote.

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)

## Features

- Control-room overview for routes, exceptions, and tickets
- Medallion-style loads and data quality gates (demo)
- Simulated live tracking — good for product and ops training
- Role-aware shell for dispatch and leadership

> Tracking in this repo is **simulated**. Wire a real GPS / courier API before production.

## Who it is for

- 3PL / last-mile startups
- Founders prototyping a **logistics TMS**
- Data teams teaching medallion + ops UX

## Quick start

```bash
git clone https://github.com/Akshit1018/S.SwiftRoute.git
cd S.SwiftRoute
npm install
VITE_AUTH_ENABLED=false npm run dev
```

Open [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Tech stack

React 19 · TanStack Start · Vite · Tailwind · PGLite

## License

[MIT](LICENSE)

## Keywords

last mile logistics dashboard, TMS open source, delivery tracking control room, Indian logistics software, warehouse CSV ops, dispatch board
