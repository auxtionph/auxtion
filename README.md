# Auxtion

> Live auction marketplace for the Philippines.
> Private repository — internal use only.

## Structure

auxtion/
├── apps/
│   ├── api/       # NestJS backend
│   └── mobile/    # React Native (Expo)
├── packages/
│   ├── types/     # Shared TypeScript types
│   └── utils/     # Shared utility functions
```

Then update `.gitignore` — make sure it contains:
```
# Environment
.env
.env.local
.env.*.local

# Dependencies
node_modules/

# Build
dist/
.turbo/
.expo/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Logs
*.log
npm-debug.log*