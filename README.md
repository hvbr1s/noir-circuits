# TypeScript + TSX Setup

## Prerequisites

- Node.js installed (v18+)
- npm or yarn

## Steps

### 1. Initialize the project

```bash
npm init -y
```

### 2. Install TypeScript and tsx

```bash
npm install -D typescript tsx @types/node
```

### 3. Initialize TypeScript config

```bash
npx tsc --init
```

### 4. Update `tsconfig.json` (recommended settings)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 5. Add scripts to `package.json`

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "build:run": "tsc && node dist/index.js"
  }
}
```

### 6. Create your entry file

```bash
mkdir src
touch src/index.ts
```

### 7. Run your code

```bash
# Run once
npm start

# Run with watch mode (auto-reload on changes)
npm run dev
```

## Why tsx?

- No build step required for development
- Fast execution using esbuild
- Supports TypeScript and ESM out of the box
- Watch mode with `tsx watch`
