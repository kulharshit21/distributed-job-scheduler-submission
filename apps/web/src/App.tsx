import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import QueueDetail from './pages/QueueDetail';
import Layout from './components/Layout';

function App() {
  const isAuthenticated = !!localStorage.getItem('access_token');

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={isAuthenticated ? <Layout /> : <Navigate to="/login" />}>
        <Route index element={<Dashboard />} />
        <Route path="projects/:projectId/queues/:queueId" element={<QueueDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
