# Detailed Code Audit and Analysis: Web Frontend (`apps/web`)

This report provides a detailed analysis of missing error handling, API failure handling, missing loading states, and robust state updates in the Vite + React dashboard frontend application (`apps/web`).

---

## 1. Summary of Core Findings
- **State Synchronization Bugs**: Stale authentication state evaluation at the application root (`App.tsx`) creates redirect loops upon login/logout.
- **Race Conditions in Auth Client**: The API client (`lib/api.ts`) lacks queueing/locking for token refresh requests, leading to multiple concurrent refresh calls and auth failures.
- **Silent Error Swallowing**: Queries in pages (like `QueueDetail.tsx`) catch API errors inside query functions and return fallback empty structures (`null`, `[]`), bypassing React Query's error detection and displaying misleading empty states to users instead of actual server errors.
- **Missing Loading Feedback**: Several components render fallback "empty" content (e.g., "No queues yet", "No jobs found", or 0 counts) during active loading states, causing bad UX and layout shifts.
- **Environment Incompatibilities**: Hardcoded WebSocket connection URLs in `lib/socket.ts` bypass env variables, breaking real-time updates in non-localhost environments.

---

## 2. Comprehensive Findings Log

### Finding 1: Stale Authorization State & Routing Guard
- **File Path**: `apps/web/src/App.tsx`
- **Line Numbers**: Lines 9, 15
- **Category**: State Updates & Routing
- **Problem**:
  ```typescript
  9:   const isAuthenticated = !!localStorage.getItem('access_token');
  ```
  `isAuthenticated` is evaluated as a static constant during the `App` component's initial render. Because it is not tied to a React state (`useState`), custom hook (`useAuth`), or Context provider, changing the authorization tokens in `localStorage` (via `Login.tsx` or `Register.tsx`) will **not** trigger a re-render of `App.tsx`.
  
  When a user logs in and the app redirects them to `/` using React Router's `navigate('/')`, the route guard evaluates `isAuthenticated` using its stale value (`false`), immediately redirecting the user back to `/login`.
- **Impact**: Critical routing loop. Users cannot log in or register without a full browser reload (`window.location.href`).

---

### Finding 2: Concurrent Token Refresh Race Condition
- **File Path**: `apps/web/src/lib/api.ts`
- **Line Numbers**: Lines 20–37 (Response Interceptor)
- **Category**: API Failure Handling / State Updates
- **Problem**:
  ```typescript
  20:     const originalRequest = error.config;
  21:     if (error.response?.status === 401 && !originalRequest._retry) {
  22:       originalRequest._retry = true;
  23:       try {
  24:         const refreshToken = localStorage.getItem('refresh_token');
  25:         const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
  ```
  If a page makes multiple concurrent API requests (common in dashboards) and the access token has expired, all calls will return a `401 Unauthorized` status at roughly the same time. The response interceptor will intercept each request and fire separate, concurrent POST requests to `${API_BASE_URL}/auth/refresh`.
  
  This triggers a race condition:
  1. The server receives multiple refresh requests. If the server invalidates refresh tokens upon single-use (best security practice), all but the first request will fail, resulting in unexpected user logouts.
  2. Multiple writes to `localStorage` for `access_token` and `refresh_token` occur concurrently.
  3. If `refreshToken` is already missing or invalid, it still calls the refresh endpoint with `null`, wasting network requests.
- **Impact**: Intermittent, hard-to-debug logouts, redundant API load, and client-side race conditions.

---

### Finding 3: Hardcoded WebSocket Server URL
- **File Path**: `apps/web/src/lib/socket.ts`
- **Line Numbers**: Line 3
- **Category**: Integration / API Failure
- **Problem**:
  ```typescript
  3: export const socket = io('http://localhost:3000', {
  ```
  The Socket.io client initialization hardcodes the host address to `http://localhost:3000`. It fails to respect custom configurations (like `import.meta.env.VITE_API_URL`), meaning that in staging or production environments, the frontend will attempt to connect to the developer's localhost socket server instead of the actual API server.
  
  Additionally, there are no handlers registered for socket errors (`connect_error`, `reconnect_failed`), making it impossible to alert the user or disable real-time controls when connection drops.
- **Impact**: Completely breaks real-time updates and notifications in non-development deployments.

---

### Finding 4: Silent Error Swallowing in Queue Details (Misleading Zero States)
- **File Path**: `apps/web/src/pages/QueueDetail.tsx`
- **Line Numbers**: Lines 13–26 (`queueStats` query) and Lines 28–39 (`jobs` query)
- **Category**: Missing Error Handling / API Failure
- **Problem**:
  ```typescript
  13:   const { data: queueStats } = useQuery({
  ...
  18:       try {
  19:         const res = await api.get(`/queues/${queueId}/stats`);
  20:         return res.data;
  21:       } catch {
  22:         return null; // Handle fallback if queue doesn't exist yet
  23:       }
  ```
  and:
  ```typescript
  31:       try {
  32:         const res = await api.get(`/queues/${queueId}/jobs`);
  33:         return res.data;
  34:       } catch {
  35:         return [];
  36:       }
  ```
  By trapping errors within the query functions and returning a default value (`null` or `[]`), React Query's default error management is bypassed. The query is considered successful, and `isError`/`error` properties returned by `useQuery` remain `false`/`null`.
  
  If the API server is down, or if the user becomes unauthorized, the UI silently falls back.
  - The Stats cards show `0` counts across the board (e.g., `queueStats?.job_counts?.queued || 0`).
  - The Jobs list displays the default "No jobs found in this queue." message.
- **Impact**: Misleads operators into believing the queue is healthy but empty, masking severe API or network failures.

---

### Finding 5: Missing Loading State Feedback (Layout Shifts)
- **File Path**: `apps/web/src/pages/Dashboard.tsx` (Lines 192–205) & `apps/web/src/pages/QueueDetail.tsx` (Lines 90–104, 140–146)
- **Category**: Missing Loading States
- **Problem**:
  - **Dashboard Queues**: In `ProjectCard`, the query for fetching queues does not check for `isLoading`. During initial retrieval, `queues` is `undefined`, causing the card to immediately render:
    `<p className="text-zinc-500 text-sm mb-2">No queues yet</p>`
    Once loaded, the content replaces the text, resulting in a noticeable layout shift.
  - **Queue Stats Cards**: During initial query loading, `queueStats` is `undefined`. All stat cards default to `0` and then jump to their actual values when the fetch completes.
  - **Queue Jobs List**: During initial loading, `jobs` is `undefined`, prompting the table to display "No jobs found in this queue." before the data is retrieved.
- **Impact**: Poor user experience, layout shifts, and brief false assertions about the state of the system.

---

### Finding 6: Unsafe Action Execution on Empty/Stale Stats
- **File Path**: `apps/web/src/pages/QueueDetail.tsx`
- **Line Numbers**: Lines 57–85
- **Category**: Robust State Updates
- **Problem**:
  ```typescript
  60:                 if (queueStats?.is_paused) {
  61:                   await api.post(`/queues/${queueId}/resume`);
  ...
  63:                 } else {
  64:                   await api.post(`/queues/${queueId}/pause`);
  ```
  If `queueStats` is `undefined` (loading) or `null` (API failure), `queueStats?.is_paused` evaluates to `undefined` (falsy). If the user clicks the pause/resume button under these conditions, the button initiates a POST request to `/queues/${queueId}/pause` regardless of the actual state of the queue on the server.
- **Impact**: Double pause requests, unexpected server-side state transitions, and UI state inconsistency.

---

### Finding 7: Lack of Global Error Boundaries & Unoptimized Query Retry Configurations
- **File Path**: `apps/web/src/main.tsx`
- **Line Numbers**: Lines 9, 11–20
- **Category**: Error Handling
- **Problem**:
  1. The app renders the React tree directly without wrapping it in an `ErrorBoundary` component. A crash in any deep component during rendering (e.g. date formatting on an invalid job timestamp or accessing properties of `null`) will crash the entire single-page application (SPA), leaving a blank white screen.
  2. The `QueryClient` is initialized with default parameters:
     ```typescript
     const queryClient = new QueryClient();
     ```
     This triggers React Query's default behavior: retrying failed queries 3 times with exponential backoff. In an interactive dashboard, if a query fails due to a `401 Unauthorized` or `404 Not Found` response, retrying is counter-productive and delays notifying the user.
- **Impact**: Fragile app reliability and slow error reporting to the user interface.

---

## 3. Concrete Fix Recommendations

### Recommendation 1: Implement global Authentication Provider
Create an `AuthContext` to centralize auth state. In `App.tsx`, read auth status from context instead of `localStorage` directly:
```tsx
export const AuthContext = createContext<{
  isAuthenticated: boolean;
  login: (tokens: { access_token: string; refresh_token: string }) => void;
  logout: () => void;
} | null>(null);

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('access_token'));
  
  const login = (tokens) => {
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('refresh_token', tokens.refresh_token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```
Update routing in `App.tsx` to depend on `useAuth()`. The context state updates will correctly trigger route guard re-evaluations.

---

### Recommendation 2: Add Token Refresh Locking and Queueing
Modify `apps/web/src/lib/api.ts` to implement a queue for requests that fail with `401` while the refresh is ongoing, preventing duplicate refresh attempts:
```typescript
let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        // Trigger event/context logout instead of window.location
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
        const { access_token, refresh_token } = res.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        processQueue(null, access_token);
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        // Trigger logout event/context
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

---

### Recommendation 3: Stop Swallowing Errors in Queries
Remove the inner `try-catch` blocks inside `useQuery` query functions. Let React Query handle the error state:
```typescript
// QueueDetail.tsx
const { data: queueStats, isLoading, isError, error } = useQuery({
  queryKey: ['queueStats', queueId],
  queryFn: async () => {
    const res = await api.get(`/queues/${queueId}/stats`);
    return res.data;
  },
  refetchInterval: 5000,
});
```
Then, explicitly render error banners and loading states in the components:
```tsx
if (isLoading) {
  return <SkeletonLoader />;
}

if (isError) {
  return <ErrorAlert message={error.message} onRetry={() => refetch()} />;
}
```

---

### Recommendation 4: Dynamic WS Connection URL & Connection Monitor
Configure the WebSocket URL to use the API URL domain dynamically:
```typescript
import { io } from 'socket.io-client';
import { API_BASE_URL } from './api';

const socketUrl = new URL(API_BASE_URL);
// Remove path components to get the host root url
const WS_URL = `${socketUrl.protocol}//${socketUrl.host}`;

export const socket = io(WS_URL, {
  autoConnect: false,
});
```

Create a hook `useSocketStatus` to monitor the connection and optionally display a toast or status indicator in the layout if the socket disconnects.

---

### Recommendation 5: Configure QueryClient and Global Error Boundary
Configure the `QueryClient` defaults to avoid retrying on client errors (4xx):
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          return false; // Do not retry client authorization or not found errors
        }
        return failureCount < 3; // Retry up to 3 times for other errors (network/500)
      },
      refetchOnWindowFocus: false,
    },
  },
});
```
Wrap `<App />` in a React Error Boundary in `main.tsx`:
```tsx
import { ErrorBoundary } from 'react-error-boundary';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-white text-center">
      <div className="glass rounded-3xl p-8 max-w-md">
        <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
        <p className="text-zinc-400 mb-6">{error.message}</p>
        <button onClick={resetErrorBoundary} className="bg-blue-600 px-6 py-2 rounded-xl">
          Try again
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          <App />
        </ErrorBoundary>
        <Toaster ... />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
```
