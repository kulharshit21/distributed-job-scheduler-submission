# Handoff Report: Web Frontend Audit

## 1. Observation
We examined all frontend files in `apps/web/src` and observed the following code sections:

- **Auth State Invalidation**:
  `apps/web/src/App.tsx:9`:
  ```typescript
  9:   const isAuthenticated = !!localStorage.getItem('access_token');
  ```
  `apps/web/src/App.tsx:15`:
  ```typescript
  15:       <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
  ```
  And `apps/web/src/pages/Login.tsx:21-23`:
  ```typescript
  21:       localStorage.setItem('access_token', res.data.access_token);
  22:       localStorage.setItem('refresh_token', res.data.refresh_token);
  23:       navigate('/');
  ```

- **Race Condition in Interceptor**:
  `apps/web/src/lib/api.ts:20-25`:
  ```typescript
  20:     const originalRequest = error.config;
  21:     if (error.response?.status === 401 && !originalRequest._retry) {
  22:       originalRequest._retry = true;
  23:       try {
  24:         const refreshToken = localStorage.getItem('refresh_token');
  25:         const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
  ```

- **Hardcoded Socket URL**:
  `apps/web/src/lib/socket.ts:3-5`:
  ```typescript
  3: export const socket = io('http://localhost:3000', {
  4:   autoConnect: false,
  5: });
  ```

- **Error Swallowing in `useQuery`**:
  `apps/web/src/pages/QueueDetail.tsx:13-26`:
  ```typescript
  13:   const { data: queueStats } = useQuery({
  14:     queryKey: ['queueStats', queueId],
  15:     queryFn: async () => {
  ...
  18:       try {
  19:         const res = await api.get(`/queues/${queueId}/stats`);
  20:         return res.data;
  21:       } catch {
  22:         return null; // Handle fallback if queue doesn't exist yet
  23:       }
  24:     },
  ```
  `apps/web/src/pages/QueueDetail.tsx:28-39`:
  ```typescript
  28:   const { data: jobs } = useQuery({
  ...
  31:       try {
  32:         const res = await api.get(`/queues/${queueId}/jobs`);
  33:         return res.data;
  34:       } catch {
  35:         return [];
  36:       }
  ```

- **Stats Fallback Render**:
  `apps/web/src/pages/QueueDetail.tsx:90-95`:
  ```typescript
  90:         {[
  91:           { label: 'Queued', value: queueStats?.job_counts?.queued || 0, icon: Clock, color: 'text-blue-400' },
  92:           { label: 'Running', value: queueStats?.job_counts?.running || 0, icon: Activity, color: 'text-amber-400' },
  ```

---

## 2. Logic Chain
Based on these observations, the logic flows as follows:

1. **Authentication Redirect Loop**: Since `isAuthenticated` in `App.tsx` is initialized as a simple module constant when `App` mounts, navigating to `/` after updating `localStorage` during login or registration does not cause a state change in `App`. As a result, the routing guard evaluates the stale `isAuthenticated = false` and redirects the user back to `/login`.
2. **Concurrent Refresh Token Failure**: When multiple queries trigger `401 Unauthorized` responses in parallel, the response interceptor initiates multiple concurrent `/auth/refresh` HTTP requests. In a secure backend environment where refresh tokens are single-use, the first completed request will invalidate the active refresh token, causing subsequent concurrent refresh requests to fail and trigger unexpected logouts.
3. **Misleading Empty States**: Returning `null` or `[]` inside the query function catches errors before React Query can register them. This suppresses the `isError` status of the query. During a connection failure or backend exception, the user is shown stats of `0` or a "No jobs found" table, which incorrectly suggests the system is functioning and empty.
4. **WebSocket Connection Failures**: Hardcoding the socket host to `http://localhost:3000` overrides external environment configurations (`VITE_API_URL`), resulting in broken WebSocket client connections on deployed staging/production systems.

---

## 3. Caveats
- We did not inspect backend implementation, endpoints, or DB persistence details of the token refresh logic.
- The repository does not contain client-side unit/integration tests for the frontend app.
- We did not run a local web server to dynamically verify runtime visual behavior, as our mission is strictly restricted to read-only investigation.

---

## 4. Conclusion
The frontend (`apps/web`) contains critical bugs in authentication routing (causing login redirect loops) and API middleware (concurrency race conditions during token refresh). Furthermore, there is a systemic pattern of swallowing errors in query hooks, which leads to layout shifts and silent error suppression (failed requests rendering as empty zero states).

Fixing these issues requires implementing an Auth context, a request-locking/queueing mechanism inside the Axios client interceptor, proper React Query error state handling, dynamic WebSocket host resolving, and a global React Error Boundary.

---

## 5. Verification Method
- **Static Code Verification**:
  Inspect the code locations in `apps/web/src/App.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/socket.ts`, and `apps/web/src/pages/QueueDetail.tsx` to verify the presence of the identified constructs.
- **Build Verification**:
  After applying the proposed changes (written to `analysis.md`), run the build command in the workspace to verify there are no TypeScript syntax or transpilation issues:
  ```powershell
  npm run build --workspace=apps/web
  ```
