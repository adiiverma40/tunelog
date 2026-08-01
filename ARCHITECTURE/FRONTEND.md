# Frontend Architecture

## Application Programming Interface(API)

### API.ts

This file contains the API calls for the frontend application.

**Changes**

1. Before it was using `VITE_API_URL` from env to get url to make API Calls. Now changing it to construct the URL dynamically

```typescript
const viteUrl = new URL(import.meta.env.VITE_URL);
const BASE_URL = `${viteUrl.protocol}//${viteUrl.hostname}:${import.meta.env.VITE_SERVER_PORT}`;
```
This removes the need for hardcoding the API URL in the frontend code.
